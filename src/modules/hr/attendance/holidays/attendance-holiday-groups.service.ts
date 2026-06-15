import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { HolidayGroup } from './entities/holiday-group.entity';
import { CreateHolidayGroupDto } from './dtos/create-holiday-group.dto';
import { HolidayGroupQueryDto } from './dtos/holiday-group-query.dto';
import { UpdateHolidayGroupDto } from './dtos/update-holiday-group.dto';

@Injectable()
export class AttendanceHolidayGroupsService {
  constructor(
    @InjectRepository(HolidayGroup)
    private readonly holidayGroupRepository: Repository<HolidayGroup>,
  ) {}

  private map(group: HolidayGroup) {
    return {
      id: group.id,
      company_id: group.companyId,
      name: group.name,
      description: group.description,
      created_at: group.createdAt,
      updated_at: group.updatedAt,
    };
  }

  private async findOrFail(companyId: number, id: number): Promise<HolidayGroup> {
    const group = await this.holidayGroupRepository.findOne({ where: { id, companyId } });
    if (!group) {
      throw new NotFoundException('Holiday group not found');
    }
    return group;
  }

  async create(companyId: number, dto: CreateHolidayGroupDto) {
    const normalizedName = dto.name.trim();
    const existing = await this.holidayGroupRepository.findOne({
      where: { companyId, name: normalizedName },
    });
    if (existing) {
      throw new ConflictException('Holiday group name already exists for this company');
    }

    const created = await this.holidayGroupRepository.save(
      this.holidayGroupRepository.create({
        companyId,
        name: normalizedName,
        description: dto.description?.trim() || null,
      }),
    );

    return this.map(created);
  }

  async findAll(companyId: number, query: HolidayGroupQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      search,
    } = query;

    const qb = this.holidayGroupRepository
      .createQueryBuilder('holidayGroup')
      .where('holidayGroup.company_id = :companyId', { companyId });

    if (search?.trim()) {
      qb.andWhere('holidayGroup.name LIKE :term', { term: `%${search.trim()}%` });
    }

    const sortFieldMap: Record<string, string> = {
      name: 'name',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.created_at;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb
      .orderBy(`holidayGroup.${safeSortBy}`, direction)
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

  async update(companyId: number, id: number, dto: UpdateHolidayGroupDto) {
    const group = await this.findOrFail(companyId, id);

    if (dto.name !== undefined) {
      const normalizedName = dto.name.trim();
      const existing = await this.holidayGroupRepository.findOne({
        where: { companyId, name: normalizedName },
      });
      if (existing && existing.id !== group.id) {
        throw new ConflictException('Holiday group name already exists for this company');
      }
      group.name = normalizedName;
    }

    if (dto.description !== undefined) {
      group.description = dto.description?.trim() || null;
    }

    return this.map(await this.holidayGroupRepository.save(group));
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const group = await this.findOrFail(companyId, id);
    await this.holidayGroupRepository.remove(group);
    return { message: 'Holiday group deleted successfully' };
  }
}






