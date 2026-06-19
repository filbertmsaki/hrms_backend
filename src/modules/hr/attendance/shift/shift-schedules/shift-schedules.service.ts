import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ensureCompanyOwnedEntity,
  ensureEmployeeBelongsToCompany,
  ensureUniqueEntity,
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

  async create(companyId: number, dto: CreateShiftScheduleDto) {
    await this.ensureEmployee(companyId, dto.employee_id);
    await this.ensureShift(companyId, dto.shift_id);
    await this.ensureShift(companyId, dto.override_shift_id);
    await this.ensureHoliday(companyId, dto.holiday_id);

    await ensureUniqueEntity(
      this.shiftScheduleRepository,
      {
        companyId,
        employeeId: dto.employee_id,
        scheduleDate: dto.schedule_date,
      },
      'Schedule already exists for this employee and date',
    );

    return this.shiftScheduleRepository.save(
      this.shiftScheduleRepository.create({
        companyId,
        employeeId: dto.employee_id,
        shiftId: dto.shift_id,
        scheduleDate: dto.schedule_date,
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
      qb.andWhere('schedule.shift_id = :shiftId', { shiftId: shift_id });
    if (from_date)
      qb.andWhere('schedule.schedule_date >= :fromDate', {
        fromDate: from_date,
      });
    if (to_date)
      qb.andWhere('schedule.schedule_date <= :toDate', { toDate: to_date });

    const sortFieldMap: Record<string, string> = {
      schedule_date: 'scheduleDate',
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

    const employeeId = dto.employee_id ?? item.employeeId;
    const scheduleDate = dto.schedule_date ?? item.scheduleDate;

    await this.ensureEmployee(companyId, employeeId);
    await this.ensureShift(companyId, dto.shift_id ?? item.shiftId);
    await this.ensureShift(
      companyId,
      dto.override_shift_id ?? item.overrideShiftId,
    );
    await this.ensureHoliday(companyId, dto.holiday_id ?? item.holidayId);

    await ensureUniqueEntity(
      this.shiftScheduleRepository,
      { companyId, employeeId, scheduleDate },
      'Schedule already exists for this employee and date',
      item.id,
    );

    item.employeeId = employeeId;
    item.scheduleDate = scheduleDate;

    if (dto.shift_id !== undefined) item.shiftId = dto.shift_id;
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
    await this.shiftScheduleRepository.remove(item);
    return { message: 'Shift schedule deleted successfully' };
  }
}
