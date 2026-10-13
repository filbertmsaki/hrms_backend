import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shift } from '../../shift/shifts/entities/shift.entity';
import { Timetable } from '../timetables/entities/timetable.entity';
import { TimetableDay } from './entities/timetable-day.entity';
import { TimetableDayShiftOption } from './entities/timetable-day-shift-option.entity';
import { CreateTimetableDayShiftOptionDto } from './dtos/create-timetable-day-shift-option.dto';
import { UpdateTimetableDayShiftOptionDto } from './dtos/update-timetable-day-shift-option.dto';
import { AttendanceScheduleAuditService } from '../../schedules/attendance-schedule-audit.service';

@Injectable()
export class TimetableDayShiftOptionsService {
  constructor(
    @InjectRepository(TimetableDayShiftOption)
    private readonly options: Repository<TimetableDayShiftOption>,
    @InjectRepository(TimetableDay)
    private readonly days: Repository<TimetableDay>,
    @InjectRepository(Timetable)
    private readonly timetables: Repository<Timetable>,
    @InjectRepository(Shift) private readonly shifts: Repository<Shift>,
    private readonly audit: AttendanceScheduleAuditService,
  ) {}

  private async getDay(companyId: number, id: number) {
    const day = await this.days
      .createQueryBuilder('day')
      .innerJoin(Timetable, 'timetable', 'timetable.id = day.timetable_id')
      .where('day.id = :id AND timetable.company_id = :companyId', {
        id,
        companyId,
      })
      .getOne();
    if (!day) throw new NotFoundException('Timetable day not found');
    return day;
  }
  async list(companyId: number, dayId?: number) {
    const qb = this.options
      .createQueryBuilder('option')
      .innerJoin('option.timetableDay', 'day')
      .innerJoin('day.timetable', 'timetable')
      .leftJoinAndSelect('option.shift', 'shift')
      .where('timetable.company_id = :companyId', { companyId });
    if (dayId) {
      await this.getDay(companyId, dayId);
      qb.andWhere('option.timetable_day_id = :dayId', { dayId });
    }
    return qb
      .orderBy('option.priorityOrder', 'ASC')
      .addOrderBy('option.id', 'ASC')
      .getMany();
  }

  async findOne(companyId: number, id: number) {
    const item = await this.options
      .createQueryBuilder('option')
      .innerJoin('option.timetableDay', 'day')
      .innerJoin('day.timetable', 'timetable')
      .leftJoinAndSelect('option.shift', 'shift')
      .where('option.id = :id AND timetable.company_id = :companyId', {
        id,
        companyId,
      })
      .getOne();
    if (!item) throw new NotFoundException('Timetable shift option not found');
    return item;
  }
  async create(
    companyId: number,
    actorId: number,
    dto: CreateTimetableDayShiftOptionDto,
  ) {
    await this.getDay(companyId, dto.timetable_day_id);
    const shift = await this.shifts.findOne({
      where: { id: dto.shift_id, companyId },
      select: ['id'],
    });
    if (!shift)
      throw new BadRequestException(
        'shift_id does not belong to the active company',
      );
    const optionCount = await this.options.count({
      where: { timetableDayId: dto.timetable_day_id },
    });
    const isPrimary = dto.is_primary ?? optionCount === 0;
    if (isPrimary)
      await this.options.update(
        { timetableDayId: dto.timetable_day_id, isPrimary: true },
        { isPrimary: false },
      );
    const item = this.options.create({
      timetableDayId: dto.timetable_day_id,
      shiftId: dto.shift_id,
      priorityOrder: dto.priority_order ?? 0,
      maxEmployees: dto.max_employees ?? null,
      isPrimary,
    });
    try {
      const saved = await this.options.save(item);
      await this.audit.log({
        companyId,
        entityType: 'TIMETABLE_SHIFT_OPTION',
        entityId: saved.id,
        action: 'CREATE',
        actorUserId: actorId,
        afterState: {
          timetableDayId: saved.timetableDayId,
          shiftId: saved.shiftId,
          priorityOrder: saved.priorityOrder,
          maxEmployees: saved.maxEmployees,
          isPrimary: saved.isPrimary,
        },
      });
      return saved;
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException(
          'This shift is already configured for the timetable day',
        );
      throw error;
    }
  }
  async update(
    companyId: number,
    actorId: number,
    id: number,
    dto: UpdateTimetableDayShiftOptionDto,
  ) {
    const item = await this.options
      .createQueryBuilder('option')
      .innerJoin('option.timetableDay', 'day')
      .innerJoin('day.timetable', 'timetable')
      .where('option.id = :id AND timetable.company_id = :companyId', {
        id,
        companyId,
      })
      .getOne();
    if (!item) throw new NotFoundException('Timetable shift option not found');
    if (dto.timetable_day_id && dto.timetable_day_id !== item.timetableDayId)
      await this.getDay(companyId, dto.timetable_day_id);
    const shiftId = dto.shift_id ?? item.shiftId;
    if (dto.shift_id) {
      const shift = await this.shifts.findOne({
        where: { id: shiftId, companyId },
        select: ['id'],
      });
      if (!shift)
        throw new BadRequestException(
          'shift_id does not belong to the active company',
        );
    }
    const dayId = dto.timetable_day_id ?? item.timetableDayId;
    if (dto.is_primary)
      await this.options.update(
        { timetableDayId: dayId, isPrimary: true },
        { isPrimary: false },
      );
    const beforeState = {
      timetableDayId: item.timetableDayId,
      shiftId: item.shiftId,
      priorityOrder: item.priorityOrder,
      maxEmployees: item.maxEmployees,
      isPrimary: item.isPrimary,
    };
    Object.assign(item, {
      timetableDayId: dayId,
      shiftId,
      priorityOrder: dto.priority_order ?? item.priorityOrder,
      maxEmployees:
        dto.max_employees === undefined ? item.maxEmployees : dto.max_employees,
      isPrimary: dto.is_primary ?? item.isPrimary,
    });
    const saved = await this.options.save(item);
    await this.audit.log({
      companyId,
      entityType: 'TIMETABLE_SHIFT_OPTION',
      entityId: saved.id,
      action: 'UPDATE',
      actorUserId: actorId,
      beforeState,
      afterState: {
        timetableDayId: saved.timetableDayId,
        shiftId: saved.shiftId,
        priorityOrder: saved.priorityOrder,
        maxEmployees: saved.maxEmployees,
        isPrimary: saved.isPrimary,
      },
    });
    return saved;
  }
  async remove(companyId: number, actorId: number, id: number) {
    const item = await this.options
      .createQueryBuilder('option')
      .innerJoin('option.timetableDay', 'day')
      .innerJoin('day.timetable', 'timetable')
      .where('option.id = :id AND timetable.company_id = :companyId', {
        id,
        companyId,
      })
      .getOne();
    if (!item) throw new NotFoundException('Timetable shift option not found');
    await this.audit.log({
      companyId,
      entityType: 'TIMETABLE_SHIFT_OPTION',
      entityId: item.id,
      action: 'DELETE',
      actorUserId: actorId,
      beforeState: {
        timetableDayId: item.timetableDayId,
        shiftId: item.shiftId,
        priorityOrder: item.priorityOrder,
        maxEmployees: item.maxEmployees,
        isPrimary: item.isPrimary,
      },
    });
    await this.options.remove(item);
    return { message: 'Timetable shift option deleted' };
  }
}
