import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { Shift } from '../shifts/entities/shift.entity';
import { ShiftOvertimeRule } from './entities/shift-overtime-rule.entity';
import { CreateShiftOvertimeRuleDto } from './dtos/create-shift-overtime-rule.dto';
import { UpdateShiftOvertimeRuleDto } from './dtos/update-shift-overtime-rule.dto';
import { ShiftOvertimeRuleQueryDto } from './dtos/shift-overtime-rule-query.dto';

@Injectable()
export class ShiftOvertimeRulesService {
  constructor(
    @InjectRepository(ShiftOvertimeRule)
    private readonly overtimeRuleRepository: Repository<ShiftOvertimeRule>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
  ) {}

  private async ensureShift(companyId: number, shiftId: number): Promise<void> {
    const shift = await this.shiftRepository.findOne({ where: { id: shiftId, companyId }, select: ['id'] });
    if (!shift) throw new BadRequestException('shift_id does not belong to the active company');
  }

  private async findOrFail(companyId: number, id: number): Promise<ShiftOvertimeRule> {
    const item = await this.overtimeRuleRepository
      .createQueryBuilder('rule')
      .innerJoin(Shift, 'shift', 'shift.id = rule.shift_id')
      .where('rule.id = :id', { id })
      .andWhere('shift.company_id = :companyId', { companyId })
      .getOne();
    if (!item) throw new NotFoundException('Shift overtime rule not found');
    return item;
  }

  async create(companyId: number, dto: CreateShiftOvertimeRuleDto) {
    await this.ensureShift(companyId, dto.shift_id);

    const duplicate = await this.overtimeRuleRepository.findOne({ where: { shiftId: dto.shift_id } });
    if (duplicate) throw new ConflictException('Overtime rule already exists for this shift');

    return this.overtimeRuleRepository.save(this.overtimeRuleRepository.create({
      shiftId: dto.shift_id,
      overtimeStartAfterMinutes: dto.overtime_start_after_minutes,
      maxDailyOvertimeMinutes: dto.max_daily_overtime_minutes,
      overtimeRateMultiplier: String(dto.overtime_rate_multiplier),
      weekendMultiplier: String(dto.weekend_multiplier),
      holidayMultiplier: String(dto.holiday_multiplier),
      requiresApproval: dto.requires_approval ?? false,
      autoCalculate: dto.auto_calculate ?? true,
    }));
  }

  async findAll(companyId: number, query: ShiftOvertimeRuleQueryDto) {
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = SortDirection.DESC, shift_id } = query;
    const qb = this.overtimeRuleRepository
      .createQueryBuilder('rule')
      .innerJoin(Shift, 'shift', 'shift.id = rule.shift_id')
      .where('shift.company_id = :companyId', { companyId });

    if (shift_id) qb.andWhere('rule.shift_id = :shiftId', { shiftId: shift_id });

    const safeSortBy = ['created_at'].includes(sortBy) ? sortBy : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const [items, total] = await qb.orderBy(`rule.${safeSortBy}`, direction).skip((page - 1) * limit).take(limit).getManyAndCount();

    return { data: items, meta: buildPaginationMeta(total, items.length, limit, page) };
  }

  async findOne(companyId: number, id: number) { return this.findOrFail(companyId, id); }

  async update(companyId: number, id: number, dto: UpdateShiftOvertimeRuleDto) {
    const item = await this.findOrFail(companyId, id);
    const shiftId = dto.shift_id ?? item.shiftId;
    await this.ensureShift(companyId, shiftId);

    const duplicate = await this.overtimeRuleRepository.findOne({ where: { shiftId } });
    if (duplicate && duplicate.id !== item.id) throw new ConflictException('Overtime rule already exists for this shift');

    item.shiftId = shiftId;
    if (dto.overtime_start_after_minutes !== undefined) item.overtimeStartAfterMinutes = dto.overtime_start_after_minutes;
    if (dto.max_daily_overtime_minutes !== undefined) item.maxDailyOvertimeMinutes = dto.max_daily_overtime_minutes;
    if (dto.overtime_rate_multiplier !== undefined) item.overtimeRateMultiplier = String(dto.overtime_rate_multiplier);
    if (dto.weekend_multiplier !== undefined) item.weekendMultiplier = String(dto.weekend_multiplier);
    if (dto.holiday_multiplier !== undefined) item.holidayMultiplier = String(dto.holiday_multiplier);
    if (dto.requires_approval !== undefined) item.requiresApproval = dto.requires_approval;
    if (dto.auto_calculate !== undefined) item.autoCalculate = dto.auto_calculate;

    return this.overtimeRuleRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.overtimeRuleRepository.remove(item);
    return { message: 'Shift overtime rule deleted successfully' };
  }
}
