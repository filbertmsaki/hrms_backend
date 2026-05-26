import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../hr/shared/hr.utils';
import { HikvisionAccessControlService } from '../../../hikvision/hikvision-access-control.service';
import { AccessScheduleTemplate } from '../../access-schedule-templates/entity/access-schedule-template.entity';
import { AccessWeekPlan } from '../entity/access-week-plan.entity';
import { CreateAccessWeekPlanDto } from '../dto/create-access-week-plan.dto';
import { UpdateAccessWeekPlanDto } from '../dto/update-access-week-plan.dto';
import { AccessDayOfWeekEnum } from '../enum/access-day-of-week.enum';

type AccessWeekPlanQuery = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: SortDirection;
  schedule_template_id?: number;
  search?: string;
};

@Injectable()
export class AccessWeekPlansService {
  constructor(
    @InjectRepository(AccessWeekPlan)
    private readonly weekPlanRepository: Repository<AccessWeekPlan>,
    @InjectRepository(AccessScheduleTemplate)
    private readonly scheduleTemplateRepository: Repository<AccessScheduleTemplate>,
    private readonly hikvisionAccessControlService: HikvisionAccessControlService,
  ) {}

  async create(companyId: number, dto: CreateAccessWeekPlanDto) {
    await this.ensureTemplate(companyId, dto.schedule_template_id);
    await this.ensureUniquePlan(companyId, dto.schedule_template_id, dto.hikvision_plan_no, dto.day_of_week);

    const entity = this.weekPlanRepository.create({
      companyId,
      scheduleTemplateId: dto.schedule_template_id,
      hikvisionPlanNo: dto.hikvision_plan_no.trim(),
      dayOfWeek: dto.day_of_week,
      startTime: dto.start_time,
      endTime: dto.end_time,
      metadata: dto.metadata ?? null,
    });

    return this.map(await this.weekPlanRepository.save(entity));
  }

  async findAll(companyId: number, query: AccessWeekPlanQuery) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      schedule_template_id,
      search,
    } = query;

    const qb = this.weekPlanRepository
      .createQueryBuilder('weekPlan')
      .where('weekPlan.company_id = :companyId', { companyId });

    if (schedule_template_id) {
      qb.andWhere('weekPlan.schedule_template_id = :scheduleTemplateId', {
        scheduleTemplateId: schedule_template_id,
      });
    }

    if (search?.trim()) {
      qb.andWhere('(weekPlan.hikvision_plan_no LIKE :term OR weekPlan.day_of_week LIKE :term)', {
        term: `%${search.trim()}%`,
      });
    }

    const allowedSortFields = ['created_at', 'updated_at', 'hikvision_plan_no', 'day_of_week'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb
      .orderBy(`weekPlan.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.map(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async update(companyId: number, id: number, dto: UpdateAccessWeekPlanDto) {
    const item = await this.findOrFail(companyId, id);

    const nextTemplateId = dto.schedule_template_id ?? item.scheduleTemplateId;
    const nextPlanNo = dto.hikvision_plan_no?.trim() ?? item.hikvisionPlanNo;
    const nextDay = dto.day_of_week ?? item.dayOfWeek;

    await this.ensureTemplate(companyId, nextTemplateId);
    await this.ensureUniquePlan(companyId, nextTemplateId, nextPlanNo, nextDay, item.id);

    item.scheduleTemplateId = nextTemplateId;
    item.hikvisionPlanNo = nextPlanNo;
    if (dto.day_of_week !== undefined) item.dayOfWeek = dto.day_of_week;
    if (dto.start_time !== undefined) item.startTime = dto.start_time;
    if (dto.end_time !== undefined) item.endTime = dto.end_time;
    if (dto.metadata !== undefined) item.metadata = dto.metadata;

    return this.map(await this.weekPlanRepository.save(item));
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.weekPlanRepository.softRemove(item);
    return { message: 'Access week plan deleted successfully' };
  }

  async syncWeekPlanToDevice(companyId: number, id: number, deviceId: number) {
    const item = await this.findOrFail(companyId, id);

    const payload = {
      UserRightWeekPlanCfg: {
        weekPlanNo: item.hikvisionPlanNo,
        weekPlan: [
          {
            dayOfWeek: item.dayOfWeek,
            timeSegment: [
              {
                startTime: item.startTime,
                endTime: item.endTime,
              },
            ],
          },
        ],
      },
    };

    const response = await this.hikvisionAccessControlService.putUserRightWeekPlanCfg(
      companyId,
      deviceId,
      item.hikvisionPlanNo,
      payload,
    );

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
      message: response.ok ? 'Week plan synced to device successfully' : 'Week plan sync failed',
      week_plan_id: item.id,
      device_id: deviceId,
      status: response.status,
      ok: response.ok,
    };
  }

  async syncWeekPlansFromDevice(
    companyId: number,
    deviceId: number,
    scheduleTemplateId: number,
  ) {
    await this.ensureTemplate(companyId, scheduleTemplateId);

    let synced = 0;
    let skipped = 0;
    let failed = 0;
    const results: Array<{ plan_no: string; status: 'SYNCED' | 'SKIPPED' | 'FAILED'; reason?: string }> = [];

    for (let planNo = 1; planNo <= 64; planNo += 1) {
      const planNoText = String(planNo);

      try {
        const response = await this.hikvisionAccessControlService.getUserRightWeekPlanCfg(
          companyId,
          deviceId,
          planNoText,
        );

        if (!response.ok) {
          if (this.isSkippable(response.raw)) {
            skipped += 1;
            results.push({ plan_no: planNoText, status: 'SKIPPED', reason: 'invalidID/notSupport' });
            continue;
          }

          failed += 1;
          results.push({ plan_no: planNoText, status: 'FAILED', reason: `status=${response.status}` });
          continue;
        }

        const parsed = this.toObject(response.parsed);
        const weekPlanCfg = this.toObject(parsed.UserRightWeekPlanCfg ?? parsed);
        const resolvedPlanNo = String(
          weekPlanCfg.weekPlanNo ?? weekPlanCfg.planNo ?? weekPlanCfg.weekPlanID ?? planNoText,
        ).trim();

        const entries = this.toArray(
          weekPlanCfg.WeekPlanCfg ?? weekPlanCfg.weekPlan ?? weekPlanCfg.weekPlanCfg ?? [],
        );

        if (!entries.length) {
          skipped += 1;
          results.push({ plan_no: resolvedPlanNo, status: 'SKIPPED', reason: 'no week plan segments' });
          continue;
        }

        let syncedEntries = 0;
        for (const entry of entries) {
          const item = this.toObject(entry);
          const dayOfWeek = this.normalizeDayOfWeek(item.week ?? item.dayOfWeek ?? item.day);
          if (!dayOfWeek) {
            continue;
          }

          const segments = this.toArray(item.TimeSegment ?? item.timeSegment ?? item.segment);
          const firstSegment = this.toObject(segments[0] ?? item.TimeSegment ?? item.timeSegment ?? {});
          const startTime = this.normalizeTimeValue(
            firstSegment.beginTime ?? firstSegment.startTime ?? firstSegment.start,
          );
          const endTime = this.normalizeTimeValue(
            firstSegment.endTime ?? firstSegment.stopTime ?? firstSegment.end,
          );

          if (!startTime || !endTime) {
            continue;
          }

          const existing = await this.weekPlanRepository.findOne({
            where: {
              companyId,
              scheduleTemplateId,
              hikvisionPlanNo: resolvedPlanNo,
              dayOfWeek,
            },
            withDeleted: true,
          });

          const entity = existing ?? this.weekPlanRepository.create();
          entity.companyId = companyId;
          entity.scheduleTemplateId = scheduleTemplateId;
          entity.hikvisionPlanNo = resolvedPlanNo;
          entity.dayOfWeek = dayOfWeek;
          entity.startTime = startTime;
          entity.endTime = endTime;
          entity.metadata = {
            ...(existing?.metadata ?? {}),
            hikvision: {
              ...this.toObject((existing?.metadata ?? {}).hikvision),
              last_pull_at: new Date().toISOString(),
              last_pull_status: response.status,
            },
          };

          if (existing?.deletedAt) {
            await this.weekPlanRepository.recover(existing);
          }

          await this.weekPlanRepository.save(entity);
          syncedEntries += 1;
        }

        if (syncedEntries === 0) {
          skipped += 1;
          results.push({ plan_no: resolvedPlanNo, status: 'SKIPPED', reason: 'no valid day/time entries' });
          continue;
        }

        synced += 1;
        results.push({ plan_no: resolvedPlanNo, status: 'SYNCED' });
      } catch (error) {
        failed += 1;
        results.push({
          plan_no: planNoText,
          status: 'FAILED',
          reason: (error as Error).message,
        });
      }
    }

    return {
      message: 'Week plans sync-from-device completed',
      device_id: deviceId,
      schedule_template_id: scheduleTemplateId,
      synced,
      skipped,
      failed,
      results,
    };
  }

  private async ensureTemplate(companyId: number, scheduleTemplateId: number): Promise<void> {
    const template = await this.scheduleTemplateRepository.findOne({
      where: { id: scheduleTemplateId, companyId },
      select: ['id'],
    });

    if (!template) {
      throw new NotFoundException('schedule_template_id not found');
    }
  }

  private async ensureUniquePlan(
    companyId: number,
    scheduleTemplateId: number,
    planNo: string,
    dayOfWeek: string,
    currentId?: number,
  ) {
    const existing = await this.weekPlanRepository.findOne({
      where: {
        companyId,
        scheduleTemplateId,
        hikvisionPlanNo: planNo,
        dayOfWeek: dayOfWeek as any,
      },
      select: ['id'],
      withDeleted: true,
    });

    if (existing && existing.id !== currentId) {
      throw new ConflictException('Duplicate week plan for schedule_template_id + hikvision_plan_no + day_of_week');
    }
  }

  private async findOrFail(companyId: number, id: number): Promise<AccessWeekPlan> {
    const item = await this.weekPlanRepository.findOne({ where: { id, companyId } });
    if (!item) {
      throw new NotFoundException('Access week plan not found');
    }

    return item;
  }

  private map(item: AccessWeekPlan) {
    return {
      id: item.id,
      company_id: item.companyId,
      schedule_template_id: item.scheduleTemplateId,
      hikvision_plan_no: item.hikvisionPlanNo,
      day_of_week: item.dayOfWeek,
      start_time: item.startTime,
      end_time: item.endTime,
      metadata: item.metadata,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      deleted_at: item.deletedAt,
    };
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
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
    return lowered.includes('invalidid') || lowered.includes('notsupport') || lowered.includes('invalid id');
  }

  private normalizeDayOfWeek(value: unknown): AccessDayOfWeekEnum | null {
    const normalized = String(value ?? '').trim().toUpperCase();
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
    const normalized = String(value ?? '').trim();
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
}
