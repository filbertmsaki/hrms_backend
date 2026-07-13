import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../hr/shared/hr.utils';
import { HikvisionAccessControlService } from '../../../hikvision/hikvision-access-control.service';
import { AccessWeekPlanSegment } from '../../access-week-plan-segments/entity/access-week-plan-segment.entity';
import { CreateAccessWeekPlanDto } from '../dto/create-access-week-plan.dto';
import { UpdateAccessWeekPlanDto } from '../dto/update-access-week-plan.dto';
import { AccessWeekPlan } from '../entity/access-week-plan.entity';
import { AccessDayOfWeekEnum } from '../enum/access-day-of-week.enum';
import { AccessWeekPlanSourceEnum } from '../enum/access-week-plan-source.enum';

type AccessWeekPlanQuery = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: SortDirection;
  device_id?: number;
  search?: string;
};

type SegmentInput = {
  week: string;
  id?: number;
  segment_no?: number;
  enable?: boolean;
  TimeSegment: {
    beginTime: string;
    endTime: string;
  };
};

type NormalizedSegment = {
  weekDay: AccessDayOfWeekEnum;
  segmentNo: number;
  enable: boolean;
  beginTime: string;
  endTime: string;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class AccessWeekPlansService {
  constructor(
    @InjectRepository(AccessWeekPlan)
    private readonly weekPlanRepository: Repository<AccessWeekPlan>,
    @InjectRepository(AccessWeekPlanSegment)
    private readonly segmentRepository: Repository<AccessWeekPlanSegment>,
    private readonly hikvisionAccessControlService: HikvisionAccessControlService,
  ) {}

  async create(companyId: number, dto: CreateAccessWeekPlanDto) {
    const hikvisionPlanNo = dto.hikvision_plan_no.trim();
    await this.ensureUniquePlan(companyId, dto.device_id, hikvisionPlanNo);

    const entity = await this.weekPlanRepository.save(
      this.weekPlanRepository.create({
        companyId,
        branchId: dto.branch_id ?? null,
        deviceId: dto.device_id,
        hikvisionPlanNo,
        name: dto.name?.trim() || null,
        enable: dto.enable ?? true,
        description: dto.description ?? null,
        source: AccessWeekPlanSourceEnum.MANUAL,
        metadata: dto.metadata ?? null,
      }),
    );

    if (dto.segments?.length) {
      await this.replaceSegments(
        entity.id,
        this.normalizeSegmentsFromDto(dto.segments),
      );
    }

    return this.findOne(companyId, entity.id);
  }

  async findAll(companyId: number, query: AccessWeekPlanQuery) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      device_id,
      search,
    } = query;

    const qb = this.weekPlanRepository
      .createQueryBuilder('weekPlan')
      .where('weekPlan.company_id = :companyId', { companyId });

    if (device_id) {
      qb.andWhere('weekPlan.device_id = :deviceId', { deviceId: device_id });
    }

    if (search?.trim()) {
      qb.andWhere(
        '(weekPlan.hikvision_plan_no LIKE :term OR weekPlan.name LIKE :term)',
        {
          term: `%${search.trim()}%`,
        },
      );
    }

    const sortFieldMap: Record<string, string> = {
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      hikvision_plan_no: 'hikvisionPlanNo',
      name: 'name',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.created_at;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb
      .orderBy(`weekPlan.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const mapped = await this.mapManyWithSegments(items);

    return {
      data: mapped,
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, id: number) {
    const item = await this.findOrFail(companyId, id);
    const segments = await this.segmentRepository.find({
      where: { weekPlanId: item.id },
    });
    return this.map(item, segments);
  }

  async update(companyId: number, id: number, dto: UpdateAccessWeekPlanDto) {
    const item = await this.findOrFail(companyId, id);
    const nextDeviceId = dto.device_id ?? item.deviceId;
    const nextPlanNo = dto.hikvision_plan_no?.trim() ?? item.hikvisionPlanNo;

    if (nextDeviceId === null) {
      throw new BadRequestException(
        'device_id is required to update a week plan',
      );
    }

    await this.ensureUniquePlan(companyId, nextDeviceId, nextPlanNo, item.id);

    item.deviceId = nextDeviceId;
    item.hikvisionPlanNo = nextPlanNo;
    if (dto.branch_id !== undefined) item.branchId = dto.branch_id ?? null;
    if (dto.name !== undefined) item.name = dto.name?.trim() || null;
    if (dto.enable !== undefined) item.enable = dto.enable;
    if (dto.description !== undefined)
      item.description = dto.description ?? null;
    if (dto.metadata !== undefined) item.metadata = dto.metadata;

    await this.weekPlanRepository.save(item);

    if (dto.segments !== undefined) {
      await this.replaceSegments(
        item.id,
        this.normalizeSegmentsFromDto(dto.segments ?? []),
      );
    }

    return this.findOne(companyId, item.id);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.weekPlanRepository.remove(item);
    return { message: 'Access week plan deleted successfully' };
  }

  async syncWeekPlanToDevice(companyId: number, id: number, deviceId: number) {
    const item = await this.findOrFail(companyId, id);
    const segments = await this.segmentRepository.find({
      where: { weekPlanId: item.id },
    });

    const payload = {
      UserRightWeekPlanCfg: {
        weekPlanNo: item.hikvisionPlanNo,
        WeekPlanCfg: this.mapSegmentsForHikvisionPayload(segments),
      },
    };

    const response =
      await this.hikvisionAccessControlService.putUserRightWeekPlanCfg(
        companyId,
        deviceId,
        item.hikvisionPlanNo,
        payload,
      );

    item.lastSyncedAt = new Date();
    item.metadata = {
      ...(item.metadata ?? {}),
      hikvision: {
        ...this.toObject((item.metadata ?? {}).hikvision),
        last_push_at: new Date().toISOString(),
        last_push_status: response.status,
      },
    };
    await this.weekPlanRepository.save(item);

    return {
      message: response.ok
        ? 'Week plan synced to device successfully'
        : 'Week plan sync failed',
      week_plan_id: item.id,
      device_id: deviceId,
      pushed_segments: segments.length,
      status: response.status,
      ok: response.ok,
    };
  }

  async syncWeekPlansFromDevice(
    companyId: number,
    deviceId: number,
    hikvisionPlanNo?: string,
  ) {
    let synced = 0;
    let skipped = 0;
    let failed = 0;
    const results: Array<{
      plan_no: string;
      status: 'SYNCED' | 'SKIPPED' | 'FAILED';
      reason?: string;
    }> = [];

    const planNumbers = hikvisionPlanNo?.trim()
      ? [hikvisionPlanNo.trim()]
      : Array.from({ length: 51 }, (_, index) => String(index));

    for (const fallbackPlanNo of planNumbers) {
      try {
        const response =
          await this.hikvisionAccessControlService.getUserRightWeekPlanCfg(
            companyId,
            deviceId,
            fallbackPlanNo,
          );

        if (!response.ok) {
          if (this.isSkippable(response.raw)) {
            skipped += 1;
            results.push({
              plan_no: fallbackPlanNo,
              status: 'SKIPPED',
              reason: 'invalidID/notSupport',
            });
            continue;
          }

          failed += 1;
          results.push({
            plan_no: fallbackPlanNo,
            status: 'FAILED',
            reason: `status=${response.status}`,
          });
          continue;
        }

        const parsed = this.toObject(response.parsed);
        const cfg = this.toObject(parsed.UserRightWeekPlanCfg ?? parsed);
        const resolvedPlanNo = this.toDisplayString(
          cfg.weekPlanNo ?? cfg.planNo ?? cfg.weekPlanID ?? fallbackPlanNo,
        ).trim();
        const normalizedSegments = this.extractSegmentsFromHikvisionCfg(cfg);

        if (!normalizedSegments.length) {
          skipped += 1;
          results.push({
            plan_no: resolvedPlanNo,
            status: 'SKIPPED',
            reason: 'no valid segments',
          });
          continue;
        }

        let weekPlan = await this.weekPlanRepository.findOne({
          where: { companyId, deviceId, hikvisionPlanNo: resolvedPlanNo },
        });

        if (!weekPlan) {
          weekPlan = this.weekPlanRepository.create({
            companyId,
            deviceId,
            hikvisionPlanNo: resolvedPlanNo,
            source: AccessWeekPlanSourceEnum.DEVICE_SYNC,
            enable: this.toBoolean(cfg.enable, true),
            isSystemDefault: false,
          });
        }

        weekPlan.name =
          this.toDisplayString(
            cfg.name ?? cfg.weekPlanName ?? weekPlan.name ?? '',
          ).trim() || weekPlan.name;
        weekPlan.enable = this.toBoolean(cfg.enable, weekPlan.enable ?? true);
        weekPlan.lastSyncedAt = new Date();
        weekPlan.metadata = {
          ...(weekPlan.metadata ?? {}),
          hikvision: {
            ...this.toObject((weekPlan.metadata ?? {}).hikvision),
            last_pull_at: new Date().toISOString(),
            last_pull_status: response.status,
            raw: parsed,
          },
        };

        const saved = await this.weekPlanRepository.save(weekPlan);
        await this.replaceSegments(saved.id, normalizedSegments);

        synced += 1;
        results.push({ plan_no: resolvedPlanNo, status: 'SYNCED' });
      } catch (error) {
        failed += 1;
        results.push({
          plan_no: fallbackPlanNo,
          status: 'FAILED',
          reason: (error as Error).message,
        });
      }
    }

    return {
      message: 'Week plans sync-from-device completed',
      device_id: deviceId,
      synced,
      skipped,
      failed,
      results,
    };
  }

  private async ensureUniquePlan(
    companyId: number,
    deviceId: number,
    planNo: string,
    currentId?: number,
  ) {
    const existing = await this.weekPlanRepository.findOne({
      where: { companyId, deviceId, hikvisionPlanNo: planNo },
      select: ['id'],
    });

    if (existing && existing.id !== currentId) {
      throw new ConflictException(
        'Duplicate week plan for device_id + hikvision_plan_no',
      );
    }
  }

  private async findOrFail(
    companyId: number,
    id: number,
  ): Promise<AccessWeekPlan> {
    const item = await this.weekPlanRepository.findOne({
      where: { id, companyId },
    });
    if (!item) {
      throw new NotFoundException('Access week plan not found');
    }

    return item;
  }

  private async replaceSegments(
    weekPlanId: number,
    segments: NormalizedSegment[],
  ) {
    await this.segmentRepository.delete({ weekPlanId });

    if (!segments.length) {
      return;
    }

    const entities = segments.map((segment) =>
      this.segmentRepository.create({
        weekPlanId,
        weekDay: segment.weekDay,
        segmentNo: segment.segmentNo,
        enable: segment.enable,
        beginTime: segment.beginTime,
        endTime: segment.endTime,
        metadata: segment.metadata ?? null,
      }),
    );

    await this.segmentRepository.save(entities);
  }

  private async mapManyWithSegments(items: AccessWeekPlan[]) {
    if (!items.length) {
      return [];
    }

    const segments = await this.segmentRepository.find({
      where: {
        weekPlanId: In(items.map((item) => item.id)),
      },
    });

    const segmentMap = new Map<number, AccessWeekPlanSegment[]>();
    for (const segment of segments) {
      if (!segmentMap.has(segment.weekPlanId)) {
        segmentMap.set(segment.weekPlanId, []);
      }
      segmentMap.get(segment.weekPlanId)!.push(segment);
    }

    return items.map((item) => this.map(item, segmentMap.get(item.id) ?? []));
  }

  private map(item: AccessWeekPlan, segments: AccessWeekPlanSegment[]) {
    return {
      id: item.id,
      company_id: item.companyId,
      branch_id: item.branchId,
      device_id: item.deviceId,
      hikvision_plan_no: item.hikvisionPlanNo,
      name: item.name,
      enable: item.enable,
      description: item.description,
      source: item.source,
      is_system_default: item.isSystemDefault,
      last_synced_at: item.lastSyncedAt,
      metadata: item.metadata,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      deleted_at: item.deletedAt,
      segments: this.mapSegmentsForApi(segments),
    };
  }

  private mapSegmentsForApi(segments: AccessWeekPlanSegment[]) {
    return [...segments]
      .sort(
        (a, b) =>
          this.dayOrder(a.weekDay) - this.dayOrder(b.weekDay) ||
          a.segmentNo - b.segmentNo,
      )
      .map((segment) => ({
        week: this.formatDay(segment.weekDay),
        id: segment.segmentNo,
        enable: segment.enable,
        TimeSegment: {
          beginTime: segment.beginTime,
          endTime: segment.endTime,
        },
        metadata: segment.metadata,
      }));
  }

  private mapSegmentsForHikvisionPayload(segments: AccessWeekPlanSegment[]) {
    return [...segments]
      .sort(
        (a, b) =>
          this.dayOrder(a.weekDay) - this.dayOrder(b.weekDay) ||
          a.segmentNo - b.segmentNo,
      )
      .map((segment) => ({
        week: this.formatDay(segment.weekDay),
        id: segment.segmentNo,
        enable: segment.enable,
        TimeSegment: {
          beginTime: segment.beginTime,
          endTime: segment.endTime,
        },
      }));
  }

  private normalizeSegmentsFromDto(
    segments: SegmentInput[],
  ): NormalizedSegment[] {
    const dedupe = new Map<string, NormalizedSegment>();

    for (const segment of segments) {
      const weekDay = this.normalizeDayOfWeek(segment.week);
      const segmentNo = Number(segment.id ?? segment.segment_no);
      const beginTime = this.normalizeTimeValue(segment.TimeSegment?.beginTime);
      const endTime = this.normalizeTimeValue(segment.TimeSegment?.endTime);

      if (
        !weekDay ||
        !segmentNo ||
        segmentNo < 1 ||
        segmentNo > 8 ||
        !beginTime ||
        !endTime
      ) {
        continue;
      }

      const key = `${weekDay}|${segmentNo}`;
      dedupe.set(key, {
        weekDay,
        segmentNo,
        enable: segment.enable ?? true,
        beginTime,
        endTime,
      });
    }

    return [...dedupe.values()].sort(
      (a, b) =>
        this.dayOrder(a.weekDay) - this.dayOrder(b.weekDay) ||
        a.segmentNo - b.segmentNo,
    );
  }

  private extractSegmentsFromHikvisionCfg(
    cfg: Record<string, unknown>,
  ): NormalizedSegment[] {
    const entries = this.toArray(
      cfg.WeekPlanCfg ?? cfg.weekPlan ?? cfg.weekPlanCfg ?? [],
    );
    const dedupe = new Map<string, NormalizedSegment>();

    for (const entry of entries) {
      const item = this.toObject(entry);
      const weekDay = this.normalizeDayOfWeek(
        item.week ?? item.dayOfWeek ?? item.day,
      );
      if (!weekDay) {
        continue;
      }

      const entryEnable = this.toBoolean(item.enable, true);
      const timeCandidates = this.toArray(
        item.TimeSegment ?? item.timeSegment ?? item.segment,
      );
      const resolvedTimeCandidates =
        timeCandidates.length > 0
          ? timeCandidates
          : [{ beginTime: item.beginTime, endTime: item.endTime }];

      for (let i = 0; i < resolvedTimeCandidates.length; i += 1) {
        const segmentObj = this.toObject(resolvedTimeCandidates[i]);
        const segmentNo = Number(
          segmentObj.id ?? segmentObj.segmentNo ?? item.id ?? i + 1,
        );
        const beginTime = this.normalizeTimeValue(
          segmentObj.beginTime ??
            segmentObj.startTime ??
            segmentObj.start ??
            item.beginTime ??
            item.startTime,
        );
        const endTime = this.normalizeTimeValue(
          segmentObj.endTime ??
            segmentObj.stopTime ??
            segmentObj.end ??
            item.endTime ??
            item.stopTime,
        );

        if (
          !segmentNo ||
          segmentNo < 1 ||
          segmentNo > 8 ||
          !beginTime ||
          !endTime
        ) {
          continue;
        }

        const key = `${weekDay}|${segmentNo}`;
        dedupe.set(key, {
          weekDay,
          segmentNo,
          enable: this.toBoolean(segmentObj.enable, entryEnable),
          beginTime,
          endTime,
          metadata: {
            raw_entry: item,
            raw_segment: segmentObj,
          },
        });
      }
    }

    return [...dedupe.values()].sort(
      (a, b) =>
        this.dayOrder(a.weekDay) - this.dayOrder(b.weekDay) ||
        a.segmentNo - b.segmentNo,
    );
  }

  private normalizeDayOfWeek(value: unknown): AccessDayOfWeekEnum | null {
    const normalized = this.toDisplayString(value).trim().toUpperCase();
    const map: Record<string, AccessDayOfWeekEnum> = {
      MONDAY: AccessDayOfWeekEnum.MONDAY,
      TUESDAY: AccessDayOfWeekEnum.TUESDAY,
      WEDNESDAY: AccessDayOfWeekEnum.WEDNESDAY,
      THURSDAY: AccessDayOfWeekEnum.THURSDAY,
      FRIDAY: AccessDayOfWeekEnum.FRIDAY,
      SATURDAY: AccessDayOfWeekEnum.SATURDAY,
      SUNDAY: AccessDayOfWeekEnum.SUNDAY,
    };
    return map[normalized] ?? null;
  }

  private normalizeTimeValue(value: unknown): string | null {
    const normalized = this.toDisplayString(value).trim();
    if (!normalized) {
      return null;
    }

    if (/^\d{2}:\d{2}:\d{2}$/.test(normalized)) {
      return normalized;
    }

    if (/^\d{2}:\d{2}$/.test(normalized)) {
      return `${normalized}:00`;
    }

    return null;
  }

  private dayOrder(day: AccessDayOfWeekEnum) {
    switch (day) {
      case AccessDayOfWeekEnum.MONDAY:
        return 1;
      case AccessDayOfWeekEnum.TUESDAY:
        return 2;
      case AccessDayOfWeekEnum.WEDNESDAY:
        return 3;
      case AccessDayOfWeekEnum.THURSDAY:
        return 4;
      case AccessDayOfWeekEnum.FRIDAY:
        return 5;
      case AccessDayOfWeekEnum.SATURDAY:
        return 6;
      case AccessDayOfWeekEnum.SUNDAY:
      default:
        return 7;
    }
  }

  private formatDay(day: AccessDayOfWeekEnum) {
    return day.charAt(0) + day.slice(1).toLowerCase();
  }

  private toBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (value === 'true' || value === '1' || value === 1) {
      return true;
    }
    if (value === 'false' || value === '0' || value === 0) {
      return false;
    }
    return fallback;
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private toDisplayString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    return JSON.stringify(value);
  }

  private toArray(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }

    if (value === null || value === undefined) {
      return [];
    }

    return [value];
  }

  private isSkippable(body: string): boolean {
    const lowered = (body || '').toLowerCase();
    return (
      lowered.includes('invalidid') ||
      lowered.includes('notsupport') ||
      lowered.includes('invalid id')
    );
  }
}
