import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { Shift } from '../shift/shifts/entities/shift.entity';
import { Timetable } from '../timetable/timetables/entities/timetable.entity';
import { TimetableDayShiftOption } from '../timetable/timetable-days/entities/timetable-day-shift-option.entity';
import { TimetableDay } from '../timetable/timetable-days/entities/timetable-day.entity';
import { EmployeeWorkSchedule } from './entities/employee-work-schedule.entity';
import { UpsertEmployeeWorkScheduleDto } from './dtos/upsert-employee-work-schedule.dto';
import { AttendanceScheduleAuditService } from './attendance-schedule-audit.service';

@Injectable()
export class EmployeeWorkSchedulesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(EmployeeWorkSchedule)
    private readonly schedules: Repository<EmployeeWorkSchedule>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(Shift) private readonly shifts: Repository<Shift>,
    @InjectRepository(Timetable)
    private readonly timetables: Repository<Timetable>,
    @InjectRepository(TimetableDayShiftOption)
    private readonly options: Repository<TimetableDayShiftOption>,
    @InjectRepository(TimetableDay)
    private readonly timetableDays: Repository<TimetableDay>,
    private readonly audit: AttendanceScheduleAuditService,
  ) {}

  private async validate(
    companyId: number,
    dto: UpsertEmployeeWorkScheduleDto,
  ) {
    const employee = await this.employees
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'companyUser')
      .where(
        'employee.id = :employeeId AND companyUser.company_id = :companyId',
        { employeeId: dto.employee_id, companyId },
      )
      .getOne();
    if (!employee)
      throw new BadRequestException(
        'employee_id does not belong to the active company',
      );
    if (dto.shift_id) {
      const shift = await this.shifts.findOne({
        where: { id: dto.shift_id, companyId },
        select: ['id'],
      });
      if (!shift)
        throw new BadRequestException(
          'shift_id does not belong to the active company',
        );
    }
    if (dto.timetable_id) {
      const timetable = await this.timetables.findOne({
        where: { id: dto.timetable_id, companyId },
        select: ['id'],
      });
      if (!timetable)
        throw new BadRequestException(
          'timetable_id does not belong to the active company',
        );
    }
    if (dto.timetable_day_shift_option_id) {
      const option = await this.options
        .createQueryBuilder('option')
        .innerJoin('option.timetableDay', 'day')
        .innerJoin('day.timetable', 'timetable')
        .where('option.id = :id AND timetable.company_id = :companyId', {
          id: dto.timetable_day_shift_option_id,
          companyId,
        })
        .getOne();
      if (!option)
        throw new BadRequestException(
          'timetable_day_shift_option_id does not belong to the active company',
        );
      const day = await this.timetableDays
        .createQueryBuilder('day')
        .innerJoin(Timetable, 'timetable', 'timetable.id = day.timetable_id')
        .where('day.id = :id AND timetable.company_id = :companyId', {
          id: option.timetableDayId,
          companyId,
        })
        .getOne();
      if (!day)
        throw new BadRequestException(
          'The selected timetable shift option is not available',
        );
      const dateDay = new Date(`${dto.schedule_date}T00:00:00Z`).getUTCDay();
      if (day.dayOfWeek !== dateDay)
        throw new BadRequestException(
          'The selected timetable shift option is not configured for this date',
        );
      if (dto.timetable_id && dto.timetable_id !== day.timetableId)
        throw new BadRequestException(
          'The selected timetable shift option does not belong to timetable_id',
        );
      dto.timetable_id = day.timetableId;
      if (dto.shift_id && dto.shift_id !== option.shiftId)
        throw new BadRequestException(
          'shift_id must match the selected timetable shift option',
        );
      dto.shift_id = option.shiftId;
    }
    if (!dto.is_off_day && !dto.shift_id)
      throw new BadRequestException(
        'shift_id is required unless this schedule is an off day',
      );
  }

  async findAll(
    companyId: number,
    from?: string,
    to?: string,
    employeeId?: number,
  ) {
    const qb = this.schedules
      .createQueryBuilder('schedule')
      .where('schedule.company_id = :companyId', { companyId });
    if (from) qb.andWhere('schedule.schedule_date >= :from', { from });
    if (to) qb.andWhere('schedule.schedule_date <= :to', { to });
    if (employeeId)
      qb.andWhere('schedule.employee_id = :employeeId', { employeeId });
    return qb
      .orderBy('schedule.scheduleDate', 'ASC')
      .addOrderBy('schedule.employeeId', 'ASC')
      .getMany();
  }

  async findOne(companyId: number, id: number) {
    const item = await this.schedules.findOne({ where: { id, companyId } });
    if (!item) throw new NotFoundException('Generated schedule not found');
    return item;
  }

  async listAudit(companyId: number, id: number) {
    await this.findOne(companyId, id);
    return this.audit.list(companyId, 'EMPLOYEE_SCHEDULE', id);
  }

  private auditState(item: EmployeeWorkSchedule): Record<string, unknown> {
    return {
      employeeId: item.employeeId,
      scheduleDate: item.scheduleDate,
      shiftId: item.shiftId,
      timetableId: item.timetableId,
      timetableDayShiftOptionId: item.timetableDayShiftOptionId,
      isOffDay: item.isOffDay,
      status: item.status,
      source: item.source,
      remarks: item.remarks,
    };
  }

  async update(
    companyId: number,
    actorId: number,
    id: number,
    dto: UpsertEmployeeWorkScheduleDto,
  ) {
    await this.validate(companyId, dto);
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EmployeeWorkSchedule);
      const item = await repo.findOne({ where: { id, companyId } });
      if (!item) throw new NotFoundException('Generated schedule not found');
      if (item.status === 'PUBLISHED')
        throw new ConflictException(
          'Published schedules must be unpublished before they can be changed',
        );
      const duplicate = await repo.findOne({
        where: {
          companyId,
          employeeId: dto.employee_id,
          scheduleDate: dto.schedule_date,
        },
      });
      if (duplicate && duplicate.id !== item.id)
        throw new ConflictException(
          'A schedule already exists for this employee and date',
        );
      const beforeState = this.auditState(item);
      Object.assign(item, {
        employeeId: dto.employee_id,
        scheduleDate: dto.schedule_date,
        shiftId: dto.shift_id ?? null,
        timetableId: dto.timetable_id ?? null,
        timetableDayShiftOptionId: dto.timetable_day_shift_option_id ?? null,
        isOffDay: dto.is_off_day ?? false,
        source: dto.timetable_day_shift_option_id
          ? 'TIMETABLE_OPTION'
          : 'MANUAL',
        assignedBy: actorId,
        remarks: dto.remarks ?? null,
      });
      const saved = await repo.save(item);
      await this.audit.log(
        {
          companyId,
          entityType: 'EMPLOYEE_SCHEDULE',
          entityId: saved.id,
          action: 'UPDATE_DRAFT',
          actorUserId: actorId,
          beforeState,
          afterState: this.auditState(saved),
        },
        manager,
      );
      return saved;
    });
  }

  async remove(companyId: number, actorId: number, id: number) {
    const item = await this.findOne(companyId, id);
    if (item.status === 'PUBLISHED')
      throw new ConflictException('Published schedules cannot be deleted');
    await this.dataSource.transaction(async (manager) => {
      await this.audit.log(
        {
          companyId,
          entityType: 'EMPLOYEE_SCHEDULE',
          entityId: item.id,
          action: 'DELETE_DRAFT',
          actorUserId: actorId,
          beforeState: this.auditState(item),
        },
        manager,
      );
      await manager.getRepository(EmployeeWorkSchedule).remove(item);
    });
    return { message: 'Draft schedule deleted' };
  }

  async upsert(
    companyId: number,
    actorId: number,
    dto: UpsertEmployeeWorkScheduleDto,
  ) {
    await this.validate(companyId, dto);
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EmployeeWorkSchedule);
      const item = await repo.findOne({
        where: {
          companyId,
          employeeId: dto.employee_id,
          scheduleDate: dto.schedule_date,
        },
      });
      if (item?.status === 'PUBLISHED')
        throw new ConflictException(
          'Published schedules must be unpublished before they can be changed',
        );
      const record = repo.create({
        ...(item ?? {}),
        companyId,
        employeeId: dto.employee_id,
        scheduleDate: dto.schedule_date,
        shiftId: dto.shift_id ?? null,
        timetableId: dto.timetable_id ?? null,
        timetableDayShiftOptionId: dto.timetable_day_shift_option_id ?? null,
        isOffDay: dto.is_off_day ?? false,
        status: 'DRAFT',
        source: dto.timetable_day_shift_option_id
          ? 'TIMETABLE_OPTION'
          : 'MANUAL',
        assignedBy: actorId,
        remarks: dto.remarks ?? null,
      });
      const saved = await repo.save(record);
      await this.audit.log(
        {
          companyId,
          entityType: 'EMPLOYEE_SCHEDULE',
          entityId: saved.id,
          action: item ? 'UPDATE_DRAFT' : 'CREATE_DRAFT',
          actorUserId: actorId,
          beforeState: item ? this.auditState(item) : null,
          afterState: this.auditState(saved),
        },
        manager,
      );
      return saved;
    });
  }

  async bulkUpsert(
    companyId: number,
    actorId: number,
    dtos: UpsertEmployeeWorkScheduleDto[],
  ) {
    if (dtos.length < 1 || dtos.length > 500)
      throw new BadRequestException(
        'Bulk scheduling accepts between 1 and 500 rows',
      );
    const keys = new Set<string>();
    for (const dto of dtos) {
      const key = `${dto.employee_id}:${dto.schedule_date}`;
      if (keys.has(key))
        throw new BadRequestException(
          'Bulk schedule contains a duplicate employee/date',
        );
      keys.add(key);
      await this.validate(companyId, dto);
    }
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EmployeeWorkSchedule);
      const result: EmployeeWorkSchedule[] = [];
      for (const dto of dtos) {
        const item = await repo.findOne({
          where: {
            companyId,
            employeeId: dto.employee_id,
            scheduleDate: dto.schedule_date,
          },
        });
        if (item?.status === 'PUBLISHED')
          throw new ConflictException(
            `Schedule ${dto.employee_id}/${dto.schedule_date} is already published`,
          );
        const saved = await repo.save(
          repo.create({
            ...(item ?? {}),
            companyId,
            employeeId: dto.employee_id,
            scheduleDate: dto.schedule_date,
            shiftId: dto.shift_id ?? null,
            timetableId: dto.timetable_id ?? null,
            timetableDayShiftOptionId:
              dto.timetable_day_shift_option_id ?? null,
            isOffDay: dto.is_off_day ?? false,
            status: 'DRAFT',
            source: dto.timetable_day_shift_option_id
              ? 'TIMETABLE_OPTION'
              : 'MANUAL',
            assignedBy: actorId,
            remarks: dto.remarks ?? null,
          }),
        );
        result.push(saved);
        await this.audit.log(
          {
            companyId,
            entityType: 'EMPLOYEE_SCHEDULE',
            entityId: saved.id,
            action: item ? 'UPDATE_DRAFT' : 'CREATE_DRAFT',
            actorUserId: actorId,
            beforeState: item ? this.auditState(item) : null,
            afterState: this.auditState(saved),
          },
          manager,
        );
      }
      return result;
    });
  }

  async publish(companyId: number, actorId: number, id: number) {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EmployeeWorkSchedule);
      const item = await repo.findOne({ where: { id, companyId } });
      if (!item) throw new NotFoundException('Generated schedule not found');
      if (item.status === 'PUBLISHED') return item;
      if (item.timetableDayShiftOptionId) {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `${companyId}:${item.scheduleDate}:${item.timetableDayShiftOptionId}`,
        ]);
        const option = await manager
          .getRepository(TimetableDayShiftOption)
          .findOne({ where: { id: item.timetableDayShiftOptionId } });
        const count = await repo.count({
          where: {
            companyId,
            scheduleDate: item.scheduleDate,
            timetableDayShiftOptionId: item.timetableDayShiftOptionId,
            status: 'PUBLISHED',
          },
        });
        if (
          option?.maxEmployees !== null &&
          option?.maxEmployees !== undefined &&
          count >= option.maxEmployees
        )
          throw new ConflictException(
            'This shift option has reached its employee capacity for the date',
          );
      }
      const beforeState = this.auditState(item);
      item.status = 'PUBLISHED';
      item.publishedBy = actorId;
      item.publishedAt = new Date();
      const saved = await repo.save(item);
      await this.audit.log(
        {
          companyId,
          entityType: 'EMPLOYEE_SCHEDULE',
          entityId: saved.id,
          action: 'PUBLISH',
          actorUserId: actorId,
          beforeState,
          afterState: this.auditState(saved),
        },
        manager,
      );
      return saved;
    });
  }

  async unpublish(companyId: number, actorId: number, id: number) {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EmployeeWorkSchedule);
      const item = await repo.findOne({ where: { id, companyId } });
      if (!item) throw new NotFoundException('Generated schedule not found');
      if (item.status !== 'PUBLISHED') return item;
      const beforeState = this.auditState(item);
      item.status = 'DRAFT';
      item.publishedBy = null;
      item.publishedAt = null;
      const saved = await repo.save(item);
      await this.audit.log(
        {
          companyId,
          entityType: 'EMPLOYEE_SCHEDULE',
          entityId: saved.id,
          action: 'UNPUBLISH',
          actorUserId: actorId,
          beforeState,
          afterState: this.auditState(saved),
        },
        manager,
      );
      return saved;
    });
  }
}
