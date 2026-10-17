import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { AttendanceHoliday } from '../../holidays/entities/holiday.entity';
import { Employee } from '../../../employees/entities/employee.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { ShiftSchedule } from './entities/shift-schedule.entity';
import { CreateShiftScheduleDto } from './dtos/create-shift-schedule.dto';
import { UpdateShiftScheduleDto } from './dtos/update-shift-schedule.dto';
import { ShiftScheduleQueryDto } from './dtos/shift-schedule-query.dto';
import {
  applyActiveAssignmentOverlapFilter,
  ensureCompanyOwnedEntity,
  ensureDateRangeOrder,
  ensureEmployeeBelongsToCompany,
  ensureRotationRuleAssignment,
  normalizeNullableText,
} from '../../shared/attendance-domain.utils';

@Injectable()
export class ShiftSchedulesService {
  constructor(
    @InjectRepository(ShiftSchedule)
    private readonly shiftScheduleRepository: Repository<ShiftSchedule>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceHoliday)
    private readonly holidayRepository: Repository<AttendanceHoliday>,
  ) {}

  private currentDateOnly(): string {
    const timezone =
      process.env.APP_TIMEZONE ||
      process.env.DEFAULT_TIMEZONE ||
      process.env.TZ ||
      'Africa/Dar_es_Salaam';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';
    return `${read('year')}-${read('month')}-${read('day')}`;
  }

  private ensureScheduleIsNotInPast(scheduleDate: string): void {
    if (scheduleDate.slice(0, 10) < this.currentDateOnly()) {
      throw new BadRequestException(
        'Shift schedules cannot be created or changed for previous days',
      );
    }
  }

  private ensureScheduleCanBeRemoved(scheduleDate: string): void {
    if (scheduleDate.slice(0, 10) <= this.currentDateOnly()) {
      throw new BadRequestException(
        'Only future shift schedules that have not started can be removed',
      );
    }
  }

  private async ensureShift(
    companyId: number,
    shiftId?: number | null,
  ): Promise<void> {
    if (!shiftId) return;
    await ensureCompanyOwnedEntity(
      this.shiftRepository,
      { id: shiftId, companyId },
      'shift_id does not belong to the active company',
    );
  }

  private async ensureEmployee(
    companyId: number,
    employeeId: number,
  ): Promise<void> {
    await ensureEmployeeBelongsToCompany(
      this.employeeRepository,
      companyId,
      employeeId,
    );
  }

  private async ensureHoliday(
    companyId: number,
    holidayId?: number | null,
  ): Promise<void> {
    if (!holidayId) return;
    await ensureCompanyOwnedEntity(
      this.holidayRepository,
      { id: holidayId, companyId },
      'holiday_id does not belong to the active company',
    );
  }

  private async findOrFail(
    companyId: number,
    id: number,
  ): Promise<ShiftSchedule> {
    const item = await this.shiftScheduleRepository.findOne({
      where: { id, companyId },
    });
    if (!item) throw new NotFoundException('Shift schedule not found');
    return item;
  }

  private resolveEffectiveRange(input: {
    schedule_date?: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
  }): { effectiveFrom: string; effectiveTo: string | null } {
    const scheduleDate = input.schedule_date ?? null;
    const effectiveFrom = input.effective_from ?? scheduleDate;
    const effectiveTo =
      input.effective_to !== undefined
        ? input.effective_to
        : scheduleDate
          ? scheduleDate
          : null;

    if (!effectiveFrom) {
      throw new BadRequestException(
        'effective_from is required when schedule_date is not provided',
      );
    }

    ensureDateRangeOrder(effectiveFrom, effectiveTo);
    return { effectiveFrom, effectiveTo };
  }

  private async ensureNoOverlappingOverride(input: {
    companyId: number;
    employeeId: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    ignoreId?: number;
  }): Promise<void> {
    const qb = this.shiftScheduleRepository.createQueryBuilder('schedule');
    applyActiveAssignmentOverlapFilter(qb, 'schedule', input);

    const existing = await qb.getOne();
    if (existing) {
      throw new BadRequestException(
        'Shift override overlaps an existing override for this employee',
      );
    }
  }

  async create(
    companyId: number,
    dto: CreateShiftScheduleDto,
    manager?: EntityManager,
  ): Promise<ShiftSchedule> {
    if (manager) {
      return new ShiftSchedulesService(
        manager.getRepository(ShiftSchedule),
        manager.getRepository(Shift),
        manager.getRepository(Employee),
        manager.getRepository(AttendanceHoliday),
      ).create(companyId, dto);
    }
    const { effectiveFrom, effectiveTo } = this.resolveEffectiveRange(dto);
    const resolvedShiftId = dto.override_shift_id ?? dto.shift_id ?? null;
    this.ensureScheduleIsNotInPast(dto.schedule_date ?? effectiveFrom);

    await this.ensureEmployee(companyId, dto.employee_id);
    await this.ensureShift(companyId, resolvedShiftId);
    await this.ensureShift(companyId, dto.override_shift_id);
    await this.ensureHoliday(companyId, dto.holiday_id);
    ensureRotationRuleAssignment(
      resolvedShiftId,
      dto.is_off_day ?? false,
      'shift_id is required when is_off_day is false',
    );
    await this.ensureNoOverlappingOverride({
      companyId,
      employeeId: dto.employee_id,
      effectiveFrom,
      effectiveTo,
    });

    return this.shiftScheduleRepository.save(
      this.shiftScheduleRepository.create({
        companyId,
        employeeId: dto.employee_id,
        shiftId: resolvedShiftId,
        scheduleDate: dto.schedule_date ?? effectiveFrom,
        effectiveFrom,
        effectiveTo,
        generatedFromRotation: dto.generated_from_rotation ?? false,
        overrideShiftId: dto.override_shift_id ?? null,
        holidayId: dto.holiday_id ?? null,
        isOffDay: dto.is_off_day ?? false,
        assignedBy: dto.assigned_by ?? null,
        remarks: normalizeNullableText(dto.remarks) ?? null,
      }),
    );
  }

  async findAll(companyId: number, query: ShiftScheduleQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'schedule_date',
      sortOrder = SortDirection.DESC,
      employee_id,
      shift_id,
      effective_from,
      effective_to,
      from_date,
      to_date,
    } = query;

    const qb = this.shiftScheduleRepository
      .createQueryBuilder('schedule')
      .where('schedule.company_id = :companyId', { companyId });
    if (employee_id)
      qb.andWhere('schedule.employee_id = :employeeId', {
        employeeId: employee_id,
      });
    if (shift_id)
      qb.andWhere(
        '(schedule.shift_id = :shiftId OR schedule.override_shift_id = :shiftId)',
        { shiftId: shift_id },
      );
    if (effective_from)
      qb.andWhere('schedule.effective_from >= :effectiveFrom', {
        effectiveFrom: effective_from,
      });
    if (effective_to)
      qb.andWhere(
        '(schedule.effective_to IS NULL OR schedule.effective_to <= :effectiveTo)',
        {
          effectiveTo: effective_to,
        },
      );
    if (from_date)
      qb.andWhere('schedule.effective_from <= :rangeEnd', {
        rangeEnd: to_date ?? from_date,
      });
    if (to_date)
      qb.andWhere(
        '(schedule.effective_to IS NULL OR schedule.effective_to >= :rangeStart)',
        {
          rangeStart: from_date ?? to_date,
        },
      );

    const sortFieldMap: Record<string, string> = {
      schedule_date: 'scheduleDate',
      effective_from: 'effectiveFrom',
      effective_to: 'effectiveTo',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.schedule_date;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const [items, total] = await qb
      .orderBy(`schedule.${safeSortBy}`, direction)
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

  async update(companyId: number, id: number, dto: UpdateShiftScheduleDto) {
    const item = await this.findOrFail(companyId, id);
    this.ensureScheduleIsNotInPast(item.scheduleDate ?? item.effectiveFrom);
    const employeeId = dto.employee_id ?? item.employeeId;
    const { effectiveFrom, effectiveTo } = this.resolveEffectiveRange({
      schedule_date: dto.schedule_date ?? item.scheduleDate,
      effective_from: dto.effective_from ?? item.effectiveFrom,
      effective_to:
        dto.effective_to !== undefined ? dto.effective_to : item.effectiveTo,
    });
    const scheduleDate =
      dto.schedule_date ?? item.scheduleDate ?? effectiveFrom;
    this.ensureScheduleIsNotInPast(scheduleDate);
    const resolvedShiftId =
      dto.override_shift_id !== undefined
        ? (dto.override_shift_id ?? dto.shift_id ?? item.shiftId)
        : (dto.shift_id ?? item.shiftId);

    await this.ensureEmployee(companyId, employeeId);
    await this.ensureShift(companyId, resolvedShiftId);
    await this.ensureShift(
      companyId,
      dto.override_shift_id ?? item.overrideShiftId,
    );
    await this.ensureHoliday(companyId, dto.holiday_id ?? item.holidayId);
    ensureRotationRuleAssignment(
      resolvedShiftId,
      dto.is_off_day !== undefined ? dto.is_off_day : item.isOffDay,
      'shift_id is required when is_off_day is false',
    );
    await this.ensureNoOverlappingOverride({
      companyId,
      employeeId,
      effectiveFrom,
      effectiveTo,
      ignoreId: item.id,
    });

    item.employeeId = employeeId;
    item.scheduleDate = scheduleDate;
    item.effectiveFrom = effectiveFrom;
    item.effectiveTo = effectiveTo;

    item.shiftId = resolvedShiftId;
    if (dto.generated_from_rotation !== undefined)
      item.generatedFromRotation = dto.generated_from_rotation;
    if (dto.override_shift_id !== undefined)
      item.overrideShiftId = dto.override_shift_id;
    if (dto.holiday_id !== undefined) item.holidayId = dto.holiday_id;
    if (dto.is_off_day !== undefined) item.isOffDay = dto.is_off_day;
    if (dto.assigned_by !== undefined) item.assignedBy = dto.assigned_by;
    if (dto.remarks !== undefined)
      item.remarks = normalizeNullableText(dto.remarks) ?? null;

    return this.shiftScheduleRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    this.ensureScheduleCanBeRemoved(item.scheduleDate ?? item.effectiveFrom);
    await this.shiftScheduleRepository.remove(item);
    return { message: 'Shift schedule deleted successfully' };
  }
}
