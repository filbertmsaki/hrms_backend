import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { AttendanceHoliday } from '../../holidays/entities/holiday.entity';
import { Employee } from '../../../employees/entities/employee.entity';
import { Shift } from '../../shift/shifts/entities/shift.entity';
import { Timetable } from '../timetables/entities/timetable.entity';
import { TimetableGeneratedSchedule } from './entities/timetable-generated-schedule.entity';
import { CreateTimetableGeneratedScheduleDto } from './dtos/create-timetable-generated-schedule.dto';
import { UpdateTimetableGeneratedScheduleDto } from './dtos/update-timetable-generated-schedule.dto';
import { TimetableGeneratedScheduleQueryDto } from './dtos/timetable-generated-schedule-query.dto';

@Injectable()
export class TimetableGeneratedSchedulesService {
  constructor(
    @InjectRepository(TimetableGeneratedSchedule)
    private readonly generatedScheduleRepository: Repository<TimetableGeneratedSchedule>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,
    @InjectRepository(AttendanceHoliday)
    private readonly holidayRepository: Repository<AttendanceHoliday>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
  ) {}

  private async ensureEmployee(companyId: number, employeeId: number): Promise<void> {
    const item = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'companyUser')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .getOne();
    if (!item) throw new BadRequestException('employee_id does not belong to the active company');
  }

  private async ensureTimetable(companyId: number, timetableId: number): Promise<void> {
    const item = await this.timetableRepository.findOne({ where: { id: timetableId, companyId }, select: ['id'] });
    if (!item) throw new BadRequestException('timetable_id does not belong to the active company');
  }

  private async ensureHoliday(companyId: number, holidayId?: number | null): Promise<void> {
    if (!holidayId) return;
    const item = await this.holidayRepository.findOne({ where: { id: holidayId, companyId }, select: ['id'] });
    if (!item) throw new BadRequestException('holiday_id does not belong to the active company');
  }

  private async ensureShift(companyId: number, shiftId?: number | null): Promise<void> {
    if (!shiftId) return;

    const item = await this.shiftRepository.findOne({
      where: { id: shiftId, companyId },
      select: ['id'],
    });
    if (!item) throw new BadRequestException('shift_id does not belong to the active company');
  }

  private async findOrFail(companyId: number, id: number): Promise<TimetableGeneratedSchedule> {
    const item = await this.generatedScheduleRepository.findOne({ where: { id, companyId } });
    if (!item) throw new NotFoundException('Generated schedule not found');
    return item;
  }

  async create(companyId: number, dto: CreateTimetableGeneratedScheduleDto) {
    await this.ensureEmployee(companyId, dto.employee_id);
    await this.ensureTimetable(companyId, dto.timetable_id);
    await this.ensureHoliday(companyId, dto.holiday_id);
    await this.ensureShift(companyId, dto.shift_id);

    const duplicate = await this.generatedScheduleRepository.findOne({
      where: { companyId, employeeId: dto.employee_id, scheduleDate: dto.schedule_date },
    });
    if (duplicate) throw new ConflictException('Schedule already exists for employee and schedule_date');

    return this.generatedScheduleRepository.save(this.generatedScheduleRepository.create({
      companyId,
      employeeId: dto.employee_id,
      timetableId: dto.timetable_id,
      shiftId: dto.shift_id ?? null,
      scheduleDate: dto.schedule_date,
      generatedFromRotation: dto.generated_from_rotation ?? false,
      isOffDay: dto.is_off_day ?? false,
      holidayId: dto.holiday_id ?? null,
      sourceRule: dto.source_rule,
    }));
  }

  async findAll(companyId: number, query: TimetableGeneratedScheduleQueryDto) {
    const { page = 1, limit = 20, sortBy = 'schedule_date', sortOrder = SortDirection.DESC, employee_id, timetable_id, holiday_id, source_rule, from_date, to_date } = query;

    const qb = this.generatedScheduleRepository.createQueryBuilder('schedule').where('schedule.company_id = :companyId', { companyId });

    if (employee_id) qb.andWhere('schedule.employee_id = :employeeId', { employeeId: employee_id });
    if (timetable_id) qb.andWhere('schedule.timetable_id = :timetableId', { timetableId: timetable_id });
    if (holiday_id) qb.andWhere('schedule.holiday_id = :holidayId', { holidayId: holiday_id });
    if (source_rule) qb.andWhere('schedule.source_rule = :sourceRule', { sourceRule: source_rule });
    if (from_date) qb.andWhere('schedule.schedule_date >= :fromDate', { fromDate: from_date });
    if (to_date) qb.andWhere('schedule.schedule_date <= :toDate', { toDate: to_date });

    const safeSortBy = ['schedule_date', 'created_at'].includes(sortBy) ? sortBy : 'schedule_date';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb.orderBy(`schedule.${safeSortBy}`, direction).skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data: items, meta: buildPaginationMeta(total, items.length, limit, page) };
  }

  async findOne(companyId: number, id: number) { return this.findOrFail(companyId, id); }

  async update(companyId: number, id: number, dto: UpdateTimetableGeneratedScheduleDto) {
    const item = await this.findOrFail(companyId, id);

    const employeeId = dto.employee_id ?? item.employeeId;
    const timetableId = dto.timetable_id ?? item.timetableId;
    const scheduleDate = dto.schedule_date ?? item.scheduleDate;

    await this.ensureEmployee(companyId, employeeId);
    await this.ensureTimetable(companyId, timetableId);
    await this.ensureHoliday(companyId, dto.holiday_id ?? item.holidayId);
    await this.ensureShift(companyId, dto.shift_id ?? item.shiftId);

    const duplicate = await this.generatedScheduleRepository.findOne({ where: { companyId, employeeId, scheduleDate } });
    if (duplicate && duplicate.id !== item.id) {
      throw new ConflictException('Schedule already exists for employee and schedule_date');
    }

    item.employeeId = employeeId;
    item.timetableId = timetableId;
    item.scheduleDate = scheduleDate;

    if (dto.shift_id !== undefined) item.shiftId = dto.shift_id;
    if (dto.generated_from_rotation !== undefined) item.generatedFromRotation = dto.generated_from_rotation;
    if (dto.is_off_day !== undefined) item.isOffDay = dto.is_off_day;
    if (dto.holiday_id !== undefined) item.holidayId = dto.holiday_id;
    if (dto.source_rule !== undefined) item.sourceRule = dto.source_rule;

    return this.generatedScheduleRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.generatedScheduleRepository.remove(item);
    return { message: 'Generated schedule deleted successfully' };
  }
}
