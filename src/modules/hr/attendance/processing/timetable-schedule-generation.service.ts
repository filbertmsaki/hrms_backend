import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { AttendanceHoliday } from '../holidays/entities/holiday.entity';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../timetable/employee-timetables/enums/employee-timetable-status.enum';
import { TimetableDay } from '../timetable/timetable-days/entities/timetable-day.entity';
import { TimetableGeneratedSchedule } from '../timetable/timetable-generated-schedules/entities/timetable-generated-schedule.entity';
import { TimetableGeneratedScheduleSourceRuleEnum } from '../timetable/timetable-generated-schedules/enums/timetable-generated-schedule-source-rule.enum';
import { TimetableHolidayActionTypeEnum } from '../timetable/timetable-holiday-rules/enums/timetable-holiday-action-type.enum';
import { TimetableHolidayRule } from '../timetable/timetable-holiday-rules/entities/timetable-holiday-rule.entity';
import { TimetableShiftRule } from '../timetable/timetable-shift-rules/entities/timetable-shift-rule.entity';
import { Timetable } from '../timetable/timetables/entities/timetable.entity';

@Injectable()
export class TimetableScheduleGenerationService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeTimetable)
    private readonly employeeTimetableRepository: Repository<EmployeeTimetable>,
    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,
    @InjectRepository(TimetableDay)
    private readonly timetableDayRepository: Repository<TimetableDay>,
    @InjectRepository(TimetableShiftRule)
    private readonly timetableShiftRuleRepository: Repository<TimetableShiftRule>,
    @InjectRepository(TimetableHolidayRule)
    private readonly timetableHolidayRuleRepository: Repository<TimetableHolidayRule>,
    @InjectRepository(TimetableGeneratedSchedule)
    private readonly generatedScheduleRepository: Repository<TimetableGeneratedSchedule>,
    @InjectRepository(AttendanceHoliday)
    private readonly holidayRepository: Repository<AttendanceHoliday>,
  ) {}

  async ensureGeneratedSchedule(
    companyId: number,
    employeeId: number,
    scheduleDate: string,
  ): Promise<TimetableGeneratedSchedule | null> {
    const existing = await this.generatedScheduleRepository.findOne({
      where: { companyId, employeeId, scheduleDate },
    });
    if (existing) {
      return existing;
    }

    const assignment = await this.employeeTimetableRepository
      .createQueryBuilder('assignment')
      .where('assignment.company_id = :companyId', { companyId })
      .andWhere('assignment.employee_id = :employeeId', { employeeId })
      .andWhere('assignment.status = :status', {
        status: EmployeeTimetableStatusEnum.ACTIVE,
      })
      .andWhere('assignment.effective_from <= :scheduleDate', { scheduleDate })
      .andWhere('(assignment.effective_to IS NULL OR assignment.effective_to >= :scheduleDate)', {
        scheduleDate,
      })
      .orderBy('assignment.effective_from', 'DESC')
      .getOne();

    if (!assignment) {
      return null;
    }

    const timetable = await this.timetableRepository.findOne({
      where: { id: assignment.timetableId, companyId },
    });
    if (!timetable) {
      return null;
    }

    const employee = await this.employeeRepository.findOne({ where: { id: employeeId } });
    const holiday = await this.resolveHoliday(companyId, employee?.primary_branch_id ?? null, scheduleDate);
    const holidayRule = holiday
      ? await this.timetableHolidayRuleRepository.findOne({
          where: {
            timetableId: timetable.id,
            holidayGroupId: holiday.holidayGroupId,
          },
        })
      : null;

    const day = await this.timetableDayRepository.findOne({
      where: { timetableId: timetable.id, dayOfWeek: this.getDayOfWeek(scheduleDate) },
    });

    let shiftId = day?.defaultShiftId ?? null;
    let isOffDay = !day || !day.isWorkingDay;

    if (day) {
      const shiftRules = await this.timetableShiftRuleRepository.find({
        where: { timetableDayId: day.id },
      });
      if (shiftRules.length > 0) {
        shiftRules.sort((a, b) => {
          if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
          return a.priorityOrder - b.priorityOrder;
        });
        shiftId = shiftRules[0].shiftId;
      }
    }

    if (holidayRule) {
      if (
        holidayRule.actionType === TimetableHolidayActionTypeEnum.OFF_DAY ||
        holidayRule.autoMarkOffday
      ) {
        isOffDay = true;
        if (holidayRule.actionType === TimetableHolidayActionTypeEnum.OFF_DAY) {
          shiftId = null;
        }
      }

      if (holidayRule.actionType === TimetableHolidayActionTypeEnum.WORKING_HOLIDAY) {
        isOffDay = false;
      }
    }

    if (!day && !holiday) {
      return null;
    }

    const created = this.generatedScheduleRepository.create({
      companyId,
      employeeId,
      timetableId: timetable.id,
      shiftId,
      scheduleDate,
      generatedFromRotation: false,
      isOffDay,
      holidayId: holiday?.id ?? null,
      sourceRule: TimetableGeneratedScheduleSourceRuleEnum.DAY,
    });

    return this.generatedScheduleRepository.save(created);
  }

  private async resolveHoliday(
    companyId: number,
    branchId: number | null,
    scheduleDate: string,
  ): Promise<AttendanceHoliday | null> {
    const qb = this.holidayRepository
      .createQueryBuilder('holiday')
      .where('holiday.company_id = :companyId', { companyId })
      .andWhere('holiday.date = :scheduleDate', { scheduleDate });

    if (branchId) {
      qb.andWhere('(holiday.branch_id IS NULL OR holiday.branch_id = :branchId)', { branchId });
    }

    return qb.orderBy('holiday.branch_id', 'DESC').getOne();
  }

  private getDayOfWeek(date: string): number {
    return new Date(`${date}T00:00:00Z`).getUTCDay();
  }
}
