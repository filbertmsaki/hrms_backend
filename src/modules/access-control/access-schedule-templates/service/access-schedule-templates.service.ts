import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../hr/shared/hr.utils';
import { HikvisionAccessControlService } from '../../../hikvision/hikvision-access-control.service';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { AccessWeekPlan } from '../../access-week-plans/entity/access-week-plan.entity';
import { AccessWeekPlanSourceEnum } from '../../access-week-plans/enum/access-week-plan-source.enum';
import { AccessScheduleTemplate } from '../entity/access-schedule-template.entity';
import { CreateAccessScheduleTemplateDto } from '../dto/create-access-schedule-template.dto';
import { UpdateAccessScheduleTemplateDto } from '../dto/update-access-schedule-template.dto';
import { AccessScheduleTemplateSourceEnum } from '../enum/access-schedule-template-source.enum';
import { AccessScheduleTemplateStatusEnum } from '../enum/access-schedule-template-status.enum';
import { AccessScheduleTemplateTypeEnum } from '../enum/access-schedule-template-type.enum';

type AccessScheduleTemplateQuery = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: SortDirection;
  status?: AccessScheduleTemplateStatusEnum;
  schedule_type?: AccessScheduleTemplateTypeEnum;
  search?: string;
};

@Injectable()
export class AccessScheduleTemplatesService {
  constructor(
    @InjectRepository(AccessScheduleTemplate)
    private readonly templateRepository: Repository<AccessScheduleTemplate>,
    @InjectRepository(AccessWeekPlan)
    private readonly weekPlanRepository: Repository<AccessWeekPlan>,
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    private readonly hikvisionAccessControlService: HikvisionAccessControlService,
  ) {}

  async create(companyId: number, dto: CreateAccessScheduleTemplateDto) {
    const device = await this.ensureDevice(companyId, dto.device_id);
    await this.ensureUniqueTemplateNo(
      companyId,
      dto.device_id,
      dto.hikvision_template_no,
    );
    await this.ensureWeekPlanBelongsToDevice(
      companyId,
      dto.week_plan_id,
      dto.device_id,
    );

    const templateName = (dto.template_name ?? dto.name ?? '').trim();
    if (!templateName) {
      throw new NotFoundException('template_name is required');
    }

    const entity = this.templateRepository.create({
      companyId,
      branchId: dto.branch_id ?? device.branchId ?? null,
      deviceId: dto.device_id,
      name: templateName,
      templateName,
      hikvisionTemplateNo: dto.hikvision_template_no.trim(),
      weekPlanId: dto.week_plan_id,
      hikvisionWeekPlanNo: dto.hikvision_week_plan_no.trim(),
      holidayGroupNo: dto.holiday_group_no?.trim() || null,
      scheduleType: dto.schedule_type ?? AccessScheduleTemplateTypeEnum.DOOR,
      status: dto.status ?? AccessScheduleTemplateStatusEnum.ACTIVE,
      metadata: dto.metadata ?? null,
    });

    return this.map(await this.templateRepository.save(entity));
  }

  async findAll(companyId: number, query: AccessScheduleTemplateQuery) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      status,
      schedule_type,
      search,
    } = query;

    const qb = this.templateRepository
      .createQueryBuilder('template')
      .where('template.company_id = :companyId', { companyId });

    if (status) {
      qb.andWhere('template.status = :status', { status });
    }

    if (schedule_type) {
      qb.andWhere('template.schedule_type = :scheduleType', {
        scheduleType: schedule_type,
      });
    }

    if (search?.trim()) {
      qb.andWhere(
        '(template.name LIKE :term OR template.hikvision_template_no LIKE :term)',
        {
          term: `%${search.trim()}%`,
        },
      );
    }

    const sortFieldMap: Record<string, string> = {
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      name: 'name',
      hikvision_template_no: 'hikvisionTemplateNo',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.created_at;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb
      .orderBy(`template.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.map(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, id: number) {
    return this.map(await this.findOrFail(companyId, id));
  }

  async update(
    companyId: number,
    id: number,
    dto: UpdateAccessScheduleTemplateDto,
  ) {
    const item = await this.findOrFail(companyId, id);
    const nextDeviceId = dto.device_id ?? item.deviceId;
    const nextTemplateNo = (
      dto.hikvision_template_no ?? item.hikvisionTemplateNo
    ).trim();

    if (nextDeviceId === null) {
      throw new BadRequestException(
        'device_id is required to update a schedule template',
      );
    }

    await this.ensureDevice(companyId, nextDeviceId);
    await this.ensureUniqueTemplateNo(
      companyId,
      nextDeviceId,
      nextTemplateNo,
      item.id,
    );

    if (dto.hikvision_template_no !== undefined) {
      item.hikvisionTemplateNo = nextTemplateNo;
    }

    if (dto.name !== undefined || dto.template_name !== undefined) {
      const name = (dto.template_name ?? dto.name ?? '').trim();
      item.name = name;
      item.templateName = name;
    }

    if (dto.branch_id !== undefined) item.branchId = dto.branch_id ?? null;
    if (dto.device_id !== undefined) item.deviceId = dto.device_id;
    if (dto.week_plan_id !== undefined) {
      await this.ensureWeekPlanBelongsToDevice(
        companyId,
        dto.week_plan_id,
        nextDeviceId,
      );
      item.weekPlanId = dto.week_plan_id;
    }
    if (dto.hikvision_week_plan_no !== undefined) {
      item.hikvisionWeekPlanNo = dto.hikvision_week_plan_no.trim();
    }
    if (dto.holiday_group_no !== undefined) {
      item.holidayGroupNo = dto.holiday_group_no?.trim() || null;
    }

    if (dto.schedule_type !== undefined) {
      item.scheduleType = dto.schedule_type;
    }

    if (dto.status !== undefined) {
      item.status = dto.status;
    }

    if (dto.metadata !== undefined) {
      item.metadata = dto.metadata;
    }

    return this.map(await this.templateRepository.save(item));
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.templateRepository.remove(item);
    return { message: 'Access schedule template deleted successfully' };
  }

  async syncTemplateToDevice(companyId: number, id: number, deviceId: number) {
    const item = await this.findOrFail(companyId, id);
    const payload = {
      UserRightPlanTemplate: {
        planTemplateNo: item.hikvisionTemplateNo,
        planTemplateName: item.name,
        templateType: item.scheduleType,
      },
    };

    const response =
      await this.hikvisionAccessControlService.putUserRightPlanTemplate(
        companyId,
        deviceId,
        item.hikvisionTemplateNo,
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

    await this.templateRepository.save(item);

    return {
      message: response.ok
        ? 'Schedule template synced to device successfully'
        : 'Schedule template sync failed',
      template_id: item.id,
      device_id: deviceId,
      status: response.status,
      ok: response.ok,
    };
  }

  async syncTemplatesFromDevice(companyId: number, deviceId: number) {
    const device = await this.ensureDevice(companyId, deviceId);
    let synced = 0;
    let skipped = 0;
    let failed = 0;
    const results: Array<{
      template_no: string;
      status: 'SYNCED' | 'SKIPPED' | 'FAILED';
      reason?: string;
    }> = [];

    for (let templateNo = 1; templateNo <= 64; templateNo += 1) {
      const templateNoText = String(templateNo);

      try {
        const response =
          await this.hikvisionAccessControlService.getUserRightPlanTemplate(
            companyId,
            deviceId,
            templateNoText,
          );

        if (!response.ok) {
          if (this.isSkippable(response.raw)) {
            skipped += 1;
            results.push({
              template_no: templateNoText,
              status: 'SKIPPED',
              reason: 'invalidID/notSupport',
            });
            continue;
          }

          failed += 1;
          results.push({
            template_no: templateNoText,
            status: 'FAILED',
            reason: `status=${response.status}`,
          });
          continue;
        }

        const parsed = this.toObject(response.parsed);
        const templateCfg = this.toObject(
          parsed.UserRightPlanTemplate ?? parsed,
        );
        const hikvisionTemplateNo = String(
          templateCfg.planTemplateNo ??
            templateCfg.templateNo ??
            templateCfg.planNo ??
            templateNoText,
        ).trim();
        const templateName =
          String(
            templateCfg.planTemplateName ??
              templateCfg.templateName ??
              templateCfg.name ??
              '',
          ).trim() || `Template ${hikvisionTemplateNo}`;

        const hikvisionWeekPlanNo = String(
          templateCfg.weekPlanNo ?? templateCfg.weekPlanID ?? '0',
        ).trim();

        let weekPlan = await this.weekPlanRepository.findOne({
          where: {
            companyId,
            deviceId,
            hikvisionPlanNo: hikvisionWeekPlanNo,
          },
        });

        if (!weekPlan) {
          weekPlan = await this.weekPlanRepository.save(
            this.weekPlanRepository.create({
              companyId,
              branchId: device.branchId ?? null,
              deviceId,
              hikvisionPlanNo: hikvisionWeekPlanNo,
              name: `Week Plan ${hikvisionWeekPlanNo}`,
              enable: true,
              source: AccessWeekPlanSourceEnum.DEVICE_SYNC,
              isSystemDefault: false,
            }),
          );
        }

        const existing = await this.templateRepository.findOne({
          where: { companyId, deviceId, hikvisionTemplateNo },
        });

        const entity = existing ?? this.templateRepository.create();
        entity.companyId = companyId;
        entity.branchId = existing?.branchId ?? device.branchId ?? null;
        entity.deviceId = deviceId;
        entity.weekPlanId = weekPlan.id;
        entity.hikvisionWeekPlanNo = hikvisionWeekPlanNo;
        entity.hikvisionTemplateNo = hikvisionTemplateNo;
        entity.name = templateName;
        entity.templateName = templateName;
        entity.enable = this.toBoolean(templateCfg.enable, true);
        entity.source = AccessScheduleTemplateSourceEnum.DEVICE_SYNC;
        entity.scheduleType = this.normalizeScheduleType(
          templateCfg.templateType ?? templateCfg.scheduleType,
        );
        entity.status = AccessScheduleTemplateStatusEnum.ACTIVE;
        entity.metadata = {
          ...(existing?.metadata ?? {}),
          hikvision: {
            ...this.toObject((existing?.metadata ?? {}).hikvision),
            last_pull_at: new Date().toISOString(),
            last_pull_status: response.status,
          },
        };

        await this.templateRepository.save(entity);
        synced += 1;
        results.push({ template_no: hikvisionTemplateNo, status: 'SYNCED' });
      } catch (error) {
        failed += 1;
        results.push({
          template_no: templateNoText,
          status: 'FAILED',
          reason: (error as Error).message,
        });
      }
    }

    return {
      message: 'Schedule template sync-from-device completed',
      device_id: deviceId,
      synced,
      skipped,
      failed,
      results,
    };
  }

  private async ensureUniqueTemplateNo(
    companyId: number,
    deviceId: number,
    templateNo: string,
    currentId?: number,
  ) {
    const existing = await this.templateRepository.findOne({
      where: { companyId, deviceId, hikvisionTemplateNo: templateNo.trim() },
      select: ['id'],
    });

    if (existing && existing.id !== currentId) {
      throw new ConflictException('hikvision_template_no already exists');
    }
  }

  private async findOrFail(
    companyId: number,
    id: number,
  ): Promise<AccessScheduleTemplate> {
    const item = await this.templateRepository.findOne({
      where: { id, companyId },
    });
    if (!item) {
      throw new NotFoundException('Access schedule template not found');
    }

    return item;
  }

  private async ensureDevice(
    companyId: number,
    deviceId: number,
  ): Promise<AttendanceDevice> {
    const device = await this.attendanceDeviceRepository.findOne({
      where: { id: deviceId, companyId },
      select: ['id', 'branchId'],
    });

    if (!device) {
      throw new BadRequestException(
        'device_id does not belong to the active company',
      );
    }

    return device;
  }

  private async ensureWeekPlanBelongsToDevice(
    companyId: number,
    weekPlanId: number,
    deviceId: number,
  ): Promise<void> {
    const weekPlan = await this.weekPlanRepository.findOne({
      where: { id: weekPlanId, companyId, deviceId },
      select: ['id'],
    });

    if (!weekPlan) {
      throw new BadRequestException(
        'week_plan_id does not belong to the provided device/company',
      );
    }
  }

  private map(item: AccessScheduleTemplate) {
    return {
      id: item.id,
      company_id: item.companyId,
      branch_id: item.branchId,
      device_id: item.deviceId,
      name: item.name,
      template_name: item.templateName,
      hikvision_template_no: item.hikvisionTemplateNo,
      week_plan_id: item.weekPlanId,
      hikvision_week_plan_no: item.hikvisionWeekPlanNo,
      holiday_group_no: item.holidayGroupNo,
      enable: item.enable,
      schedule_type: item.scheduleType,
      status: item.status,
      source: item.source,
      is_system_default: item.isSystemDefault,
      last_synced_at: item.lastSyncedAt,
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

  private isSkippable(body: string): boolean {
    const lowered = (body || '').toLowerCase();
    return (
      lowered.includes('invalidid') ||
      lowered.includes('notsupport') ||
      lowered.includes('invalid id')
    );
  }

  private normalizeScheduleType(
    value: unknown,
  ): AccessScheduleTemplateTypeEnum {
    const normalized = String(value ?? '')
      .trim()
      .toUpperCase();
    if (
      Object.values(AccessScheduleTemplateTypeEnum).includes(
        normalized as AccessScheduleTemplateTypeEnum,
      )
    ) {
      return normalized as AccessScheduleTemplateTypeEnum;
    }

    return AccessScheduleTemplateTypeEnum.DOOR;
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
}
