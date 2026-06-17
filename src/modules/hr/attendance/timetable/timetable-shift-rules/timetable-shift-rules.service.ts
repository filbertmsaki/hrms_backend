import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { Shift } from '../../shift/shifts/entities/shift.entity';
import { TimetableDay } from '../timetable-days/entities/timetable-day.entity';
import { Timetable } from '../timetables/entities/timetable.entity';
import { TimetableShiftRule } from './entities/timetable-shift-rule.entity';
import { CreateTimetableShiftRuleDto } from './dtos/create-timetable-shift-rule.dto';
import { UpdateTimetableShiftRuleDto } from './dtos/update-timetable-shift-rule.dto';
import { TimetableShiftRuleQueryDto } from './dtos/timetable-shift-rule-query.dto';
import { TimetableGeneratedScheduleInvalidationService } from '../timetable-generated-schedules/timetable-generated-schedule-invalidation.service';

@Injectable()
export class TimetableShiftRulesService {
  constructor(
    @InjectRepository(TimetableShiftRule)
    private readonly shiftRuleRepository: Repository<TimetableShiftRule>,
    @InjectRepository(TimetableDay)
    private readonly timetableDayRepository: Repository<TimetableDay>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
    private readonly generatedScheduleInvalidationService: TimetableGeneratedScheduleInvalidationService,
  ) {}

  private async ensureTimetableDay(
    companyId: number,
    timetableDayId: number,
  ): Promise<void> {
    const item = await this.timetableDayRepository
      .createQueryBuilder('day')
      .innerJoin(Timetable, 'timetable', 'timetable.id = day.timetable_id')
      .where('day.id = :timetableDayId', { timetableDayId })
      .andWhere('timetable.company_id = :companyId', { companyId })
      .getOne();
    if (!item)
      throw new BadRequestException(
        'timetable_day_id does not belong to the active company',
      );
  }

  private async ensureShift(companyId: number, shiftId: number): Promise<void> {
    const shift = await this.shiftRepository.findOne({
      where: { id: shiftId, companyId },
      select: ['id'],
    });
    if (!shift)
      throw new BadRequestException(
        'shift_id does not belong to the active company',
      );
  }

  private async findOrFail(
    companyId: number,
    id: number,
  ): Promise<TimetableShiftRule> {
    const item = await this.shiftRuleRepository
      .createQueryBuilder('rule')
      .innerJoin(TimetableDay, 'day', 'day.id = rule.timetable_day_id')
      .innerJoin(Timetable, 'timetable', 'timetable.id = day.timetable_id')
      .where('rule.id = :id', { id })
      .andWhere('timetable.company_id = :companyId', { companyId })
      .getOne();
    if (!item) throw new NotFoundException('Timetable shift rule not found');
    return item;
  }

  async create(companyId: number, dto: CreateTimetableShiftRuleDto) {
    await this.ensureTimetableDay(companyId, dto.timetable_day_id);
    await this.ensureShift(companyId, dto.shift_id);

    const duplicate = await this.shiftRuleRepository.findOne({
      where: {
        timetableDayId: dto.timetable_day_id,
        priorityOrder: dto.priority_order ?? 1,
      },
    });
    if (duplicate)
      throw new ConflictException(
        'priority_order already exists for this timetable day',
      );

    const created = await this.shiftRuleRepository.save(
      this.shiftRuleRepository.create({
        timetableDayId: dto.timetable_day_id,
        shiftId: dto.shift_id,
        priorityOrder: dto.priority_order ?? 1,
        isPrimary: dto.is_primary ?? false,
        maxEmployees: dto.max_employees ?? null,
      }),
    );

    const day = await this.timetableDayRepository.findOne({
      where: { id: created.timetableDayId },
      select: ['timetableId'],
    });
    if (day) {
      await this.generatedScheduleInvalidationService.invalidate({
        companyId,
        timetableId: day.timetableId,
      });
    }

    return created;
  }

  async findAll(companyId: number, query: TimetableShiftRuleQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'priority_order',
      sortOrder = SortDirection.ASC,
      timetable_day_id,
    } = query;

    const qb = this.shiftRuleRepository
      .createQueryBuilder('rule')
      .innerJoin(TimetableDay, 'day', 'day.id = rule.timetable_day_id')
      .innerJoin(Timetable, 'timetable', 'timetable.id = day.timetable_id')
      .where('timetable.company_id = :companyId', { companyId });

    if (timetable_day_id)
      qb.andWhere('rule.timetable_day_id = :timetableDayId', {
        timetableDayId: timetable_day_id,
      });

    const sortFieldMap: Record<string, string> = {
      priority_order: 'priorityOrder',
      created_at: 'createdAt',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.priority_order;
    const direction = sortOrder === SortDirection.DESC ? 'DESC' : 'ASC';

    const [items, total] = await qb
      .orderBy(`rule.${safeSortBy}`, direction)
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
    dto: UpdateTimetableShiftRuleDto,
  ) {
    const item = await this.findOrFail(companyId, id);
    const previousDay = await this.timetableDayRepository.findOne({
      where: { id: item.timetableDayId },
      select: ['timetableId'],
    });

    const timetableDayId = dto.timetable_day_id ?? item.timetableDayId;
    const priorityOrder = dto.priority_order ?? item.priorityOrder;
    await this.ensureTimetableDay(companyId, timetableDayId);
    await this.ensureShift(companyId, dto.shift_id ?? item.shiftId);

    const duplicate = await this.shiftRuleRepository.findOne({
      where: { timetableDayId, priorityOrder },
    });
    if (duplicate && duplicate.id !== item.id)
      throw new ConflictException(
        'priority_order already exists for this timetable day',
      );

    item.timetableDayId = timetableDayId;
    item.priorityOrder = priorityOrder;
    if (dto.shift_id !== undefined) item.shiftId = dto.shift_id;
    if (dto.is_primary !== undefined) item.isPrimary = dto.is_primary;
    if (dto.max_employees !== undefined) item.maxEmployees = dto.max_employees;

    const saved = await this.shiftRuleRepository.save(item);
    const day = await this.timetableDayRepository.findOne({
      where: { id: saved.timetableDayId },
      select: ['timetableId'],
    });
    if (previousDay && previousDay.timetableId !== day?.timetableId) {
      await this.generatedScheduleInvalidationService.invalidate({
        companyId,
        timetableId: previousDay.timetableId,
      });
    }
    if (day) {
      await this.generatedScheduleInvalidationService.invalidate({
        companyId,
        timetableId: day.timetableId,
      });
    }

    return saved;
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    const day = await this.timetableDayRepository.findOne({
      where: { id: item.timetableDayId },
      select: ['timetableId'],
    });
    await this.shiftRuleRepository.remove(item);
    if (day) {
      await this.generatedScheduleInvalidationService.invalidate({
        companyId,
        timetableId: day.timetableId,
      });
    }
    return { message: 'Timetable shift rule deleted successfully' };
  }
}
