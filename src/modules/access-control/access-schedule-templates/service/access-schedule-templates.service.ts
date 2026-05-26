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
import { AccessScheduleTemplate } from '../entity/access-schedule-template.entity';
import { CreateAccessScheduleTemplateDto } from '../dto/create-access-schedule-template.dto';
import { UpdateAccessScheduleTemplateDto } from '../dto/update-access-schedule-template.dto';
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
    private readonly hikvisionAccessControlService: HikvisionAccessControlService,
  ) {}

  async create(companyId: number, dto: CreateAccessScheduleTemplateDto) {
    await this.ensureUniqueTemplateNo(companyId, dto.hikvision_template_no);

    const entity = this.templateRepository.create({
      companyId,
      name: dto.name.trim(),
      hikvisionTemplateNo: dto.hikvision_template_no.trim(),
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
      qb.andWhere('(template.name LIKE :term OR template.hikvision_template_no LIKE :term)', {
        term: `%${search.trim()}%`,
      });
    }

    const allowedSortFields = ['created_at', 'updated_at', 'name', 'hikvision_template_no'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
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

  async update(companyId: number, id: number, dto: UpdateAccessScheduleTemplateDto) {
    const item = await this.findOrFail(companyId, id);

    if (dto.hikvision_template_no !== undefined) {
      await this.ensureUniqueTemplateNo(companyId, dto.hikvision_template_no, item.id);
      item.hikvisionTemplateNo = dto.hikvision_template_no.trim();
    }

    if (dto.name !== undefined) {
      item.name = dto.name.trim();
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
    await this.templateRepository.softRemove(item);
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

    const response = await this.hikvisionAccessControlService.putUserRightPlanTemplate(
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
    let synced = 0;
    let skipped = 0;
    let failed = 0;
    const results: Array<{ template_no: string; status: 'SYNCED' | 'SKIPPED' | 'FAILED'; reason?: string }> = [];

    for (let templateNo = 1; templateNo <= 64; templateNo += 1) {
      const templateNoText = String(templateNo);

      try {
        const response = await this.hikvisionAccessControlService.getUserRightPlanTemplate(
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
        const templateCfg = this.toObject(parsed.UserRightPlanTemplate ?? parsed);
        const hikvisionTemplateNo = String(
          templateCfg.planTemplateNo ??
            templateCfg.templateNo ??
            templateCfg.planNo ??
            templateNoText,
        ).trim();
        const templateName =
          String(
            templateCfg.planTemplateName ?? templateCfg.templateName ?? templateCfg.name ?? '',
          ).trim() || `Template ${hikvisionTemplateNo}`;

        const existing = await this.templateRepository.findOne({
          where: { companyId, hikvisionTemplateNo },
          withDeleted: true,
        });

        const entity = existing ?? this.templateRepository.create();
        entity.companyId = companyId;
        entity.hikvisionTemplateNo = hikvisionTemplateNo;
        entity.name = templateName;
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

        if (existing?.deletedAt) {
          await this.templateRepository.recover(existing);
        }

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
    templateNo: string,
    currentId?: number,
  ) {
    const existing = await this.templateRepository.findOne({
      where: { companyId, hikvisionTemplateNo: templateNo.trim() },
      select: ['id'],
      withDeleted: true,
    });

    if (existing && existing.id !== currentId) {
      throw new ConflictException('hikvision_template_no already exists');
    }
  }

  private async findOrFail(companyId: number, id: number): Promise<AccessScheduleTemplate> {
    const item = await this.templateRepository.findOne({ where: { id, companyId } });
    if (!item) {
      throw new NotFoundException('Access schedule template not found');
    }

    return item;
  }

  private map(item: AccessScheduleTemplate) {
    return {
      id: item.id,
      company_id: item.companyId,
      name: item.name,
      hikvision_template_no: item.hikvisionTemplateNo,
      schedule_type: item.scheduleType,
      status: item.status,
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
    return lowered.includes('invalidid') || lowered.includes('notsupport') || lowered.includes('invalid id');
  }

  private normalizeScheduleType(value: unknown): AccessScheduleTemplateTypeEnum {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (Object.values(AccessScheduleTemplateTypeEnum).includes(normalized as AccessScheduleTemplateTypeEnum)) {
      return normalized as AccessScheduleTemplateTypeEnum;
    }

    return AccessScheduleTemplateTypeEnum.DOOR;
  }
}
