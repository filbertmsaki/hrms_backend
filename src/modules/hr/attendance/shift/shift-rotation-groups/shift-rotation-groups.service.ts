import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { ShiftRotationGroup } from './entities/shift-rotation-group.entity';
import { CreateShiftRotationGroupDto } from './dtos/create-shift-rotation-group.dto';
import { UpdateShiftRotationGroupDto } from './dtos/update-shift-rotation-group.dto';
import { ShiftRotationGroupQueryDto } from './dtos/shift-rotation-group-query.dto';
import {
  ensureUniqueEntity,
  normalizeNullableText,
  normalizeTrimmedText,
} from '../../shared/attendance-domain.utils';

@Injectable()
export class ShiftRotationGroupsService {
  constructor(
    @InjectRepository(ShiftRotationGroup)
    private readonly rotationGroupRepository: Repository<ShiftRotationGroup>,
  ) {}

  private async findOrFail(
    companyId: number,
    id: number,
  ): Promise<ShiftRotationGroup> {
    const item = await this.rotationGroupRepository.findOne({
      where: { id, companyId },
    });
    if (!item) throw new NotFoundException('Shift rotation group not found');
    return item;
  }

  async create(companyId: number, dto: CreateShiftRotationGroupDto) {
    const name = normalizeTrimmedText(dto.name);
    const code = normalizeTrimmedText(dto.code);

    await ensureUniqueEntity(
      this.rotationGroupRepository,
      { companyId, name },
      'Rotation group name already exists for this company',
    );
    await ensureUniqueEntity(
      this.rotationGroupRepository,
      { companyId, code },
      'Rotation group code already exists for this company',
    );

    return this.rotationGroupRepository.save(
      this.rotationGroupRepository.create({
        companyId,
        name,
        code,
        cycleDays: dto.cycle_days,
        description: normalizeNullableText(dto.description) ?? null,
        status: dto.status,
      }),
    );
  }

  async findAll(companyId: number, query: ShiftRotationGroupQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      status,
      search,
    } = query;

    const qb = this.rotationGroupRepository
      .createQueryBuilder('rotationGroup')
      .where('rotationGroup.company_id = :companyId', { companyId });
    if (status) qb.andWhere('rotationGroup.status = :status', { status });
    if (search?.trim())
      qb.andWhere(
        '(rotationGroup.name LIKE :term OR rotationGroup.code LIKE :term)',
        { term: `%${search.trim()}%` },
      );

    const sortFieldMap: Record<string, string> = {
      name: 'name',
      code: 'code',
      created_at: 'createdAt',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.created_at;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const [items, total] = await qb
      .orderBy(`rotationGroup.${safeSortBy}`, direction)
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

  async update(
    companyId: number,
    id: number,
    dto: UpdateShiftRotationGroupDto,
  ) {
    const item = await this.findOrFail(companyId, id);

    if (dto.name !== undefined) {
      const name = normalizeTrimmedText(dto.name);
      await ensureUniqueEntity(
        this.rotationGroupRepository,
        { companyId, name },
        'Rotation group name already exists for this company',
        item.id,
      );
      item.name = name;
    }

    if (dto.code !== undefined) {
      const code = normalizeTrimmedText(dto.code);
      await ensureUniqueEntity(
        this.rotationGroupRepository,
        { companyId, code },
        'Rotation group code already exists for this company',
        item.id,
      );
      item.code = code;
    }

    if (dto.cycle_days !== undefined) item.cycleDays = dto.cycle_days;
    if (dto.description !== undefined)
      item.description = normalizeNullableText(dto.description) ?? null;
    if (dto.status !== undefined) item.status = dto.status;

    return this.rotationGroupRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.rotationGroupRepository.remove(item);
    return { message: 'Shift rotation group deleted successfully' };
  }
}
