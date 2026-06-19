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
import { Timetable } from '../timetables/entities/timetable.entity';
import { TimetableDay } from './entities/timetable-day.entity';
import { CreateTimetableDayDto } from './dtos/create-timetable-day.dto';
import { UpdateTimetableDayDto } from './dtos/update-timetable-day.dto';
import { TimetableDayQueryDto } from './dtos/timetable-day-query.dto';

@Injectable()
export class TimetableDaysService {
  constructor(
    @InjectRepository(TimetableDay)
    private readonly timetableDayRepository: Repository<TimetableDay>,
    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
  ) {}

  private async ensureTimetable(
    companyId: number,
    timetableId: number,
  ): Promise<void> {
    const timetable = await this.timetableRepository.findOne({
      where: { id: timetableId, companyId },
      select: ['id'],
    });
    if (!timetable)
      throw new BadRequestException(
        'timetable_id does not belong to the active company',
      );
  }

  private async ensureShift(
    companyId: number,
    shiftId?: number | null,
  ): Promise<void> {
    if (!shiftId) return;

    const shift = await this.shiftRepository.findOne({
      where: { id: shiftId, companyId },
      select: ['id'],
    });
    if (!shift)
      throw new BadRequestException(
        'default_shift_id does not belong to the active company',
      );
  }

  private ensureWorkingDayHasDefaultShift(input: {
    isWorkingDay: boolean;
    defaultShiftId?: number | null;
  }): void {
    if (input.isWorkingDay && !input.defaultShiftId) {
      throw new BadRequestException(
        'default_shift_id is required when is_working_day is true',
      );
    }
  }

  private async findOrFail(
    companyId: number,
    id: number,
  ): Promise<TimetableDay> {
    const item = await this.timetableDayRepository
      .createQueryBuilder('day')
      .innerJoin(Timetable, 'timetable', 'timetable.id = day.timetable_id')
      .where('day.id = :id', { id })
      .andWhere('timetable.company_id = :companyId', { companyId })
      .getOne();
    if (!item) throw new NotFoundException('Timetable day not found');
    return item;
  }

  async create(companyId: number, dto: CreateTimetableDayDto) {
    await this.ensureTimetable(companyId, dto.timetable_id);
    await this.ensureShift(companyId, dto.default_shift_id);
    this.ensureWorkingDayHasDefaultShift({
      isWorkingDay: dto.is_working_day ?? true,
      defaultShiftId: dto.default_shift_id,
    });

    const duplicate = await this.timetableDayRepository.findOne({
      where: { timetableId: dto.timetable_id, dayOfWeek: dto.day_of_week },
    });
    if (duplicate)
      throw new ConflictException(
        'Day configuration already exists for this day_of_week',
      );

    return this.timetableDayRepository.save(
      this.timetableDayRepository.create({
        timetableId: dto.timetable_id,
        dayOfWeek: dto.day_of_week,
        isWorkingDay: dto.is_working_day ?? true,
        defaultShiftId: dto.default_shift_id ?? null,
        minimumWorkMinutes: dto.minimum_work_minutes ?? 0,
        expectedCheckInTime: dto.expected_check_in_time ?? null,
        expectedCheckOutTime: dto.expected_check_out_time ?? null,
        allowFlexibleTime: dto.allow_flexible_time ?? false,
        flexibleStartFrom: dto.flexible_start_from ?? null,
        flexibleStartTo: dto.flexible_start_to ?? null,
        overtimeAllowed: dto.overtime_allowed ?? false,
        breakRequired: dto.break_required ?? false,
        breakMinutes: dto.break_minutes ?? 0,
      }),
    );
  }

  async findAll(companyId: number, query: TimetableDayQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'day_of_week',
      sortOrder = SortDirection.ASC,
      timetable_id,
    } = query;

    const qb = this.timetableDayRepository
      .createQueryBuilder('day')
      .innerJoin(Timetable, 'timetable', 'timetable.id = day.timetable_id')
      .where('timetable.company_id = :companyId', { companyId });

    if (timetable_id)
      qb.andWhere('day.timetable_id = :timetableId', {
        timetableId: timetable_id,
      });

    const sortFieldMap: Record<string, string> = {
      day_of_week: 'dayOfWeek',
      created_at: 'createdAt',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.day_of_week;
    const direction = sortOrder === SortDirection.DESC ? 'DESC' : 'ASC';

    const [items, total] = await qb
      .orderBy(`day.${safeSortBy}`, direction)
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

  async update(companyId: number, id: number, dto: UpdateTimetableDayDto) {
    const item = await this.findOrFail(companyId, id);

    const timetableId = dto.timetable_id ?? item.timetableId;
    const dayOfWeek = dto.day_of_week ?? item.dayOfWeek;

    await this.ensureTimetable(companyId, timetableId);
    await this.ensureShift(
      companyId,
      dto.default_shift_id ?? item.defaultShiftId,
    );
    this.ensureWorkingDayHasDefaultShift({
      isWorkingDay: dto.is_working_day ?? item.isWorkingDay,
      defaultShiftId:
        dto.default_shift_id !== undefined
          ? dto.default_shift_id
          : item.defaultShiftId,
    });

    const duplicate = await this.timetableDayRepository.findOne({
      where: { timetableId, dayOfWeek },
    });
    if (duplicate && duplicate.id !== item.id) {
      throw new ConflictException(
        'Day configuration already exists for this day_of_week',
      );
    }

    item.timetableId = timetableId;
    item.dayOfWeek = dayOfWeek;

    if (dto.is_working_day !== undefined)
      item.isWorkingDay = dto.is_working_day;
    if (dto.default_shift_id !== undefined)
      item.defaultShiftId = dto.default_shift_id;
    if (dto.minimum_work_minutes !== undefined)
      item.minimumWorkMinutes = dto.minimum_work_minutes;
    if (dto.expected_check_in_time !== undefined)
      item.expectedCheckInTime = dto.expected_check_in_time;
    if (dto.expected_check_out_time !== undefined)
      item.expectedCheckOutTime = dto.expected_check_out_time;
    if (dto.allow_flexible_time !== undefined)
      item.allowFlexibleTime = dto.allow_flexible_time;
    if (dto.flexible_start_from !== undefined)
      item.flexibleStartFrom = dto.flexible_start_from;
    if (dto.flexible_start_to !== undefined)
      item.flexibleStartTo = dto.flexible_start_to;
    if (dto.overtime_allowed !== undefined)
      item.overtimeAllowed = dto.overtime_allowed;
    if (dto.break_required !== undefined)
      item.breakRequired = dto.break_required;
    if (dto.break_minutes !== undefined) item.breakMinutes = dto.break_minutes;

    return this.timetableDayRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.timetableDayRepository.remove(item);
    return { message: 'Timetable day deleted successfully' };
  }
}
