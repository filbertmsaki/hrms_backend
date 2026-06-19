import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { Branch } from '../../../branches/entities/branch.entity';
import { Timetable } from './entities/timetable.entity';
import { CreateTimetableDto } from './dtos/create-timetable.dto';
import { UpdateTimetableDto } from './dtos/update-timetable.dto';
import { TimetableQueryDto } from './dtos/timetable-query.dto';
import {
  ensureCompanyOwnedEntity,
  ensureUniqueEntity,
  normalizeNullableText,
  normalizeTrimmedText,
} from '../../shared/attendance-domain.utils';

@Injectable()
export class TimetablesService {
  constructor(
    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  private async ensureBranch(
    companyId: number,
    branchId?: number | null,
  ): Promise<void> {
    if (!branchId) return;
    await ensureCompanyOwnedEntity(
      this.branchRepository,
      { id: branchId, company_id: companyId },
      'branch_id does not belong to the active company',
    );
  }

  private async findOrFail(companyId: number, id: number): Promise<Timetable> {
    const item = await this.timetableRepository.findOne({
      where: { id, companyId },
    });
    if (!item) throw new NotFoundException('Timetable not found');
    return item;
  }

  private async setDefaultTimetable(
    companyId: number,
    timetableId: number,
    isDefault: boolean,
  ): Promise<void> {
    if (!isDefault) {
      return;
    }

    await this.timetableRepository.manager.transaction(async (manager) => {
      await manager
        .getRepository(Timetable)
        .update({ companyId, isDefault: true }, { isDefault: false });

      const result = await manager
        .getRepository(Timetable)
        .update({ id: timetableId, companyId }, { isDefault: true });

      if (!result.affected) {
        throw new NotFoundException('Timetable not found');
      }
    });
  }

  async create(
    companyId: number,
    createdBy: number | null,
    dto: CreateTimetableDto,
  ) {
    await this.ensureBranch(companyId, dto.branch_id);

    const code = normalizeTrimmedText(dto.code);
    const name = normalizeTrimmedText(dto.name);

    await ensureUniqueEntity(
      this.timetableRepository,
      { companyId, code },
      'Timetable code already exists for this company',
    );
    await ensureUniqueEntity(
      this.timetableRepository,
      { companyId, name },
      'Timetable name already exists for this company',
    );

    const created = await this.timetableRepository.save(
      this.timetableRepository.create({
        companyId,
        branchId: dto.branch_id ?? null,
        name,
        code,
        description: normalizeNullableText(dto.description) ?? null,
        timetableType: dto.timetable_type,
        timezone: normalizeTrimmedText(dto.timezone),
        isDefault: dto.is_default ?? false,
        lateAfterMinutes: dto.late_after_minutes ?? 0,
        halfDayAfterMinutes: dto.half_day_after_minutes ?? 0,
        absentAfterMinutes: dto.absent_after_minutes ?? 0,
        allowEarlyCheckin: dto.allow_early_checkin ?? true,
        allowLateCheckout: dto.allow_late_checkout ?? true,
        autoAbsentIfNoCheckin: dto.auto_absent_if_no_checkin ?? true,
        maxOvertimeMinutes: dto.max_overtime_minutes ?? 0,
        status: dto.status,
        createdBy,
      }),
    );

    await this.setDefaultTimetable(companyId, created.id, created.isDefault);
    return created;
  }

  async findAll(companyId: number, query: TimetableQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      search,
      branch_id,
      timetable_type,
      status,
    } = query;

    const qb = this.timetableRepository
      .createQueryBuilder('timetable')
      .where('timetable.company_id = :companyId', { companyId });

    if (branch_id)
      qb.andWhere('timetable.branch_id = :branchId', { branchId: branch_id });
    if (timetable_type)
      qb.andWhere('timetable.timetable_type = :timetableType', {
        timetableType: timetable_type,
      });
    if (status) qb.andWhere('timetable.status = :status', { status });
    if (search?.trim())
      qb.andWhere('(timetable.name LIKE :term OR timetable.code LIKE :term)', {
        term: `%${search.trim()}%`,
      });

    const sortFieldMap: Record<string, string> = {
      name: 'name',
      code: 'code',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.created_at;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb
      .orderBy(`timetable.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items,
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, id: number) {
    return this.findOrFail(companyId, id);
  }

  async update(companyId: number, id: number, dto: UpdateTimetableDto) {
    const item = await this.findOrFail(companyId, id);

    if (dto.branch_id !== undefined) {
      await this.ensureBranch(companyId, dto.branch_id);
      item.branchId = dto.branch_id ?? null;
    }

    if (dto.name !== undefined) {
      const name = normalizeTrimmedText(dto.name);
      await ensureUniqueEntity(
        this.timetableRepository,
        { companyId, name },
        'Timetable name already exists for this company',
        item.id,
      );
      item.name = name;
    }

    if (dto.code !== undefined) {
      const code = normalizeTrimmedText(dto.code);
      await ensureUniqueEntity(
        this.timetableRepository,
        { companyId, code },
        'Timetable code already exists for this company',
        item.id,
      );
      item.code = code;
    }

    if (dto.description !== undefined)
      item.description = normalizeNullableText(dto.description) ?? null;
    if (dto.timetable_type !== undefined)
      item.timetableType = dto.timetable_type;
    if (dto.timezone !== undefined)
      item.timezone = normalizeTrimmedText(dto.timezone);
    if (dto.is_default !== undefined) item.isDefault = dto.is_default;
    if (dto.late_after_minutes !== undefined)
      item.lateAfterMinutes = dto.late_after_minutes;
    if (dto.half_day_after_minutes !== undefined)
      item.halfDayAfterMinutes = dto.half_day_after_minutes;
    if (dto.absent_after_minutes !== undefined)
      item.absentAfterMinutes = dto.absent_after_minutes;
    if (dto.allow_early_checkin !== undefined)
      item.allowEarlyCheckin = dto.allow_early_checkin;
    if (dto.allow_late_checkout !== undefined)
      item.allowLateCheckout = dto.allow_late_checkout;
    if (dto.auto_absent_if_no_checkin !== undefined)
      item.autoAbsentIfNoCheckin = dto.auto_absent_if_no_checkin;
    if (dto.max_overtime_minutes !== undefined)
      item.maxOvertimeMinutes = dto.max_overtime_minutes;
    if (dto.status !== undefined) item.status = dto.status;

    const saved = await this.timetableRepository.save(item);
    await this.setDefaultTimetable(companyId, saved.id, saved.isDefault);
    return this.findOrFail(companyId, saved.id);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.timetableRepository.softRemove(item);
    return { message: 'Timetable deleted successfully' };
  }
}
