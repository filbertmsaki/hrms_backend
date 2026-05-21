import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { HolidayGroup } from '../../holidays/entities/holiday-group.entity';
import { Timetable } from '../timetables/entities/timetable.entity';
import { TimetableHolidayRule } from './entities/timetable-holiday-rule.entity';
import { CreateTimetableHolidayRuleDto } from './dtos/create-timetable-holiday-rule.dto';
import { UpdateTimetableHolidayRuleDto } from './dtos/update-timetable-holiday-rule.dto';
import { TimetableHolidayRuleQueryDto } from './dtos/timetable-holiday-rule-query.dto';

@Injectable()
export class TimetableHolidayRulesService {
  constructor(
    @InjectRepository(TimetableHolidayRule)
    private readonly holidayRuleRepository: Repository<TimetableHolidayRule>,
    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,
    @InjectRepository(HolidayGroup)
    private readonly holidayGroupRepository: Repository<HolidayGroup>,
  ) {}

  private async ensureTimetable(companyId: number, timetableId: number): Promise<void> {
    const item = await this.timetableRepository.findOne({ where: { id: timetableId, companyId }, select: ['id'] });
    if (!item) throw new BadRequestException('timetable_id does not belong to the active company');
  }

  private async ensureHolidayGroup(companyId: number, holidayGroupId: number): Promise<void> {
    const item = await this.holidayGroupRepository.findOne({ where: { id: holidayGroupId, companyId }, select: ['id'] });
    if (!item) throw new BadRequestException('holiday_group_id does not belong to the active company');
  }

  private async findOrFail(companyId: number, id: number): Promise<TimetableHolidayRule> {
    const item = await this.holidayRuleRepository
      .createQueryBuilder('rule')
      .innerJoin(Timetable, 'timetable', 'timetable.id = rule.timetable_id')
      .where('rule.id = :id', { id })
      .andWhere('timetable.company_id = :companyId', { companyId })
      .getOne();

    if (!item) throw new NotFoundException('Timetable holiday rule not found');
    return item;
  }

  async create(companyId: number, dto: CreateTimetableHolidayRuleDto) {
    await this.ensureTimetable(companyId, dto.timetable_id);
    await this.ensureHolidayGroup(companyId, dto.holiday_group_id);

    const duplicate = await this.holidayRuleRepository.findOne({ where: { timetableId: dto.timetable_id, holidayGroupId: dto.holiday_group_id } });
    if (duplicate) throw new ConflictException('Holiday rule already exists for this timetable and holiday group');

    return this.holidayRuleRepository.save(this.holidayRuleRepository.create({
      timetableId: dto.timetable_id,
      holidayGroupId: dto.holiday_group_id,
      actionType: dto.action_type,
      applyOvertimeRules: dto.apply_overtime_rules ?? false,
      autoMarkOffday: dto.auto_mark_offday ?? true,
    }));
  }

  async findAll(companyId: number, query: TimetableHolidayRuleQueryDto) {
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = SortDirection.DESC, timetable_id } = query;

    const qb = this.holidayRuleRepository
      .createQueryBuilder('rule')
      .innerJoin(Timetable, 'timetable', 'timetable.id = rule.timetable_id')
      .where('timetable.company_id = :companyId', { companyId });

    if (timetable_id) qb.andWhere('rule.timetable_id = :timetableId', { timetableId: timetable_id });

    const safeSortBy = ['created_at'].includes(sortBy) ? sortBy : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb.orderBy(`rule.${safeSortBy}`, direction).skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data: items, meta: buildPaginationMeta(total, items.length, limit, page) };
  }

  async findOne(companyId: number, id: number) { return this.findOrFail(companyId, id); }

  async update(companyId: number, id: number, dto: UpdateTimetableHolidayRuleDto) {
    const item = await this.findOrFail(companyId, id);

    const timetableId = dto.timetable_id ?? item.timetableId;
    const holidayGroupId = dto.holiday_group_id ?? item.holidayGroupId;

    await this.ensureTimetable(companyId, timetableId);
    await this.ensureHolidayGroup(companyId, holidayGroupId);

    const duplicate = await this.holidayRuleRepository.findOne({ where: { timetableId, holidayGroupId } });
    if (duplicate && duplicate.id !== item.id) {
      throw new ConflictException('Holiday rule already exists for this timetable and holiday group');
    }

    item.timetableId = timetableId;
    item.holidayGroupId = holidayGroupId;
    if (dto.action_type !== undefined) item.actionType = dto.action_type;
    if (dto.apply_overtime_rules !== undefined) item.applyOvertimeRules = dto.apply_overtime_rules;
    if (dto.auto_mark_offday !== undefined) item.autoMarkOffday = dto.auto_mark_offday;

    return this.holidayRuleRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.holidayRuleRepository.remove(item);
    return { message: 'Timetable holiday rule deleted successfully' };
  }
}
