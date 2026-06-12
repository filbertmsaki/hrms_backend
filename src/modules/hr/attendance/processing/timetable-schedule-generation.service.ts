import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { AttendanceHoliday } from '../holidays/entities/holiday.entity';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../timetable/employee-timetables/enums/employee-timetable-status.enum';
import { TimetableAttendanceRule } from '../timetable/timetable-attendance-rules/entities/timetable-attendance-rule.entity';
import { TimetableDay } from '../timetable/timetable-days/entities/timetable-day.entity';
import { TimetableGeneratedSchedule } from '../timetable/timetable-generated-schedules/entities/timetable-generated-schedule.entity';
import { TimetableGeneratedScheduleSourceRuleEnum } from '../timetable/timetable-generated-schedules/enums/timetable-generated-schedule-source-rule.enum';
import { TimetableHolidayActionTypeEnum } from '../timetable/timetable-holiday-rules/enums/timetable-holiday-action-type.enum';
import { TimetableHolidayRule } from '../timetable/timetable-holiday-rules/entities/timetable-holiday-rule.entity';
import { TimetableRotationRule } from '../timetable/timetable-rotation-rules/entities/timetable-rotation-rule.entity';
import { TimetableRotation } from '../timetable/timetable-rotations/entities/timetable-rotation.entity';
import { TimetableRotationStatusEnum } from '../timetable/timetable-rotations/enums/timetable-rotation-status.enum';
import { TimetableShiftRule } from '../timetable/timetable-shift-rules/entities/timetable-shift-rule.entity';
import { Timetable } from '../timetable/timetables/entities/timetable.entity';
import { TimetableTypeEnum } from '../timetable/timetables/enums/timetable-type.enum';

type TimetableScheduleDefinition = {
  companyId: number;
  employeeId: number;
  branchId: number | null;
  timetableId: number;
  shiftId: number | null;
  scheduleDate: string;
  timezone: string;
  generatedFromRotation: boolean;
  isOffDay: boolean;
  holidayId: number | null;
  sourceRule: TimetableGeneratedScheduleSourceRuleEnum;
  expectedCheckInTime: string | null;
  expectedCheckOutTime: string | null;
  overtimeAllowed: boolean | null;
  shouldPersist: boolean;
};

type TimetableBaseSchedule = {
  shiftId: number | null;
  isOffDay: boolean;
  generatedFromRotation: boolean;
  sourceRule: TimetableGeneratedScheduleSourceRuleEnum;
  expectedCheckInTime: string | null;
  expectedCheckOutTime: string | null;
  overtimeAllowed: boolean | null;
};

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
    @InjectRepository(TimetableRotation)
    private readonly timetableRotationRepository: Repository<TimetableRotation>,
    @InjectRepository(TimetableRotationRule)
    private readonly timetableRotationRuleRepository: Repository<TimetableRotationRule>,
    @InjectRepository(TimetableAttendanceRule)
    private readonly timetableAttendanceRuleRepository: Repository<TimetableAttendanceRule>,
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

    const definition = await this.buildScheduleDefinition(
      companyId,
      employeeId,
      scheduleDate,
    );
    if (!definition) {
      return null;
    }

    if (!definition.shouldPersist) {
      return null;
    }

    const created = this.generatedScheduleRepository.create({
      companyId: definition.companyId,
      employeeId: definition.employeeId,
      timetableId: definition.timetableId,
      shiftId: definition.shiftId,
      scheduleDate: definition.scheduleDate,
      generatedFromRotation: definition.generatedFromRotation,
      isOffDay: definition.isOffDay,
      holidayId: definition.holidayId,
      sourceRule: definition.sourceRule,
    });

    return this.generatedScheduleRepository.save(created);
  }

  async buildScheduleDefinition(
    companyId: number,
    employeeId: number,
    scheduleDate: string,
  ): Promise<TimetableScheduleDefinition | null> {
    const assignment = await this.findActiveAssignment(companyId, employeeId, scheduleDate);
    if (!assignment) {
      return null;
    }

    const timetable = await this.timetableRepository.findOne({
      where: { id: assignment.timetableId, companyId },
    });
    if (!timetable) {
      return null;
    }

    const employee = await this.findEmployee(companyId, employeeId);
    const branchId = employee?.primary_branch_id ?? null;
    const holiday = await this.resolveHoliday(companyId, branchId, scheduleDate);
    const holidayRule = holiday
      ? await this.timetableHolidayRuleRepository.findOne({
          where: {
            timetableId: timetable.id,
            holidayGroupId: holiday.holidayGroupId,
          },
        })
      : null;

    let baseSchedule =
      timetable.timetableType === TimetableTypeEnum.ROTATIONAL
        ? await this.resolveRotationalBaseSchedule(
            timetable,
            assignment,
            scheduleDate,
          )
        : await this.resolveDayBaseSchedule(
            timetable.id,
            scheduleDate,
            Boolean(holiday),
          );

    if (!baseSchedule && holiday) {
      baseSchedule = {
        shiftId: null,
        isOffDay: true,
        generatedFromRotation: timetable.timetableType === TimetableTypeEnum.ROTATIONAL,
        sourceRule: TimetableGeneratedScheduleSourceRuleEnum.OVERRIDE,
        expectedCheckInTime: null,
        expectedCheckOutTime: null,
        overtimeAllowed: null,
      };
    }

    if (!baseSchedule) {
      return null;
    }

    if (holidayRule) {
      baseSchedule = this.applyHolidayOverride(baseSchedule, holidayRule);
    }

    return {
      companyId,
      employeeId,
      branchId,
      timetableId: timetable.id,
      shiftId: baseSchedule.shiftId,
      scheduleDate,
      timezone: timetable.timezone,
      generatedFromRotation: baseSchedule.generatedFromRotation,
      isOffDay: baseSchedule.isOffDay,
      holidayId: holiday?.id ?? null,
      sourceRule: holidayRule
        ? TimetableGeneratedScheduleSourceRuleEnum.OVERRIDE
        : baseSchedule.sourceRule,
      expectedCheckInTime: baseSchedule.expectedCheckInTime,
      expectedCheckOutTime: baseSchedule.expectedCheckOutTime,
      overtimeAllowed: baseSchedule.overtimeAllowed,
      shouldPersist:
        baseSchedule.shiftId !== null ||
        baseSchedule.isOffDay ||
        !baseSchedule.expectedCheckInTime ||
        !baseSchedule.expectedCheckOutTime,
    };
  }

  async findTimetableAttendanceRule(
    timetableId: number,
  ): Promise<TimetableAttendanceRule | null> {
    return this.timetableAttendanceRuleRepository.findOne({
      where: { timetableId },
    });
  }

  private async findActiveAssignment(
    companyId: number,
    employeeId: number,
    scheduleDate: string,
  ): Promise<EmployeeTimetable | null> {
    return this.employeeTimetableRepository
      .createQueryBuilder('assignment')
      .where('assignment.company_id = :companyId', { companyId })
      .andWhere('assignment.employee_id = :employeeId', { employeeId })
      .andWhere('assignment.status = :status', {
        status: EmployeeTimetableStatusEnum.ACTIVE,
      })
      .andWhere('assignment.effective_from <= :scheduleDate', { scheduleDate })
      .andWhere(
        '(assignment.effective_to IS NULL OR assignment.effective_to >= :scheduleDate)',
        { scheduleDate },
      )
      .orderBy('assignment.effective_from', 'DESC')
      .getOne();
  }

  private async findEmployee(
    companyId: number,
    employeeId: number,
  ): Promise<Employee | null> {
    return this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'companyUser')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .getOne();
  }

  private async resolveDayBaseSchedule(
    timetableId: number,
    scheduleDate: string,
    allowHolidayFallback: boolean,
  ): Promise<TimetableBaseSchedule | null> {
    const day = await this.timetableDayRepository.findOne({
      where: { timetableId, dayOfWeek: this.getDayOfWeek(scheduleDate) },
    });

    if (!day) {
      return allowHolidayFallback
        ? {
            shiftId: null,
            isOffDay: true,
            generatedFromRotation: false,
            sourceRule: TimetableGeneratedScheduleSourceRuleEnum.DAY,
            expectedCheckInTime: null,
            expectedCheckOutTime: null,
            overtimeAllowed: null,
          }
        : null;
    }

    let shiftId = day.defaultShiftId ?? null;
    const shiftRules = await this.timetableShiftRuleRepository.find({
      where: { timetableDayId: day.id },
    });
    if (shiftRules.length > 0) {
      shiftRules.sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) {
          return a.isPrimary ? -1 : 1;
        }

        return a.priorityOrder - b.priorityOrder;
      });
      shiftId = shiftRules[0].shiftId;
    }

    return {
      shiftId,
      isOffDay: !day.isWorkingDay,
      generatedFromRotation: false,
      sourceRule: TimetableGeneratedScheduleSourceRuleEnum.DAY,
      expectedCheckInTime: day.expectedCheckInTime ?? null,
      expectedCheckOutTime: day.expectedCheckOutTime ?? null,
      overtimeAllowed: day.overtimeAllowed,
    };
  }

  private async resolveRotationalBaseSchedule(
    timetable: Timetable,
    assignment: EmployeeTimetable,
    scheduleDate: string,
  ): Promise<TimetableBaseSchedule | null> {
    const rotation = await this.timetableRotationRepository.findOne({
      where: {
        companyId: timetable.companyId,
        timetableId: timetable.id,
        status: TimetableRotationStatusEnum.ACTIVE,
      },
      order: { id: 'ASC' },
    });

    if (!rotation || rotation.cycleDays < 1) {
      return null;
    }

    const dayIndex = this.computeCycleDayIndex(
      assignment.effectiveFrom,
      scheduleDate,
      rotation.cycleDays,
    );
    const rotationRule = await this.timetableRotationRuleRepository.findOne({
      where: { rotationId: rotation.id, dayIndex },
    });

    if (!rotationRule) {
      return null;
    }

    return {
      shiftId: rotationRule.shiftId ?? null,
      isOffDay: rotationRule.isOffDay,
      generatedFromRotation: true,
      sourceRule: TimetableGeneratedScheduleSourceRuleEnum.ROTATION,
      expectedCheckInTime: null,
      expectedCheckOutTime: null,
      overtimeAllowed: null,
    };
  }

  private applyHolidayOverride(
    baseSchedule: TimetableBaseSchedule,
    holidayRule: TimetableHolidayRule,
  ): TimetableBaseSchedule {
    const next = { ...baseSchedule };

    if (
      holidayRule.actionType === TimetableHolidayActionTypeEnum.OFF_DAY ||
      holidayRule.autoMarkOffday
    ) {
      next.isOffDay = true;
      if (holidayRule.actionType === TimetableHolidayActionTypeEnum.OFF_DAY) {
        next.shiftId = null;
      }
    }

    if (holidayRule.actionType === TimetableHolidayActionTypeEnum.WORKING_HOLIDAY) {
      next.isOffDay = false;
    }

    return next;
  }

  private async resolveHoliday(
    companyId: number,
    branchId: number | null,
    scheduleDate: string,
  ): Promise<AttendanceHoliday | null> {
    const [, month, day] = scheduleDate.split('-');
    const monthDay = `${month}-${day}`;
    const qb = this.holidayRepository
      .createQueryBuilder('holiday')
      .where('holiday.company_id = :companyId', { companyId })
      .andWhere(
        '(holiday.date = :scheduleDate OR (holiday.is_recurring = :isRecurring AND DATE_FORMAT(holiday.date, \'%m-%d\') = :monthDay))',
        {
          scheduleDate,
          isRecurring: true,
          monthDay,
        },
      );

    if (branchId === null) {
      qb.andWhere('holiday.branch_id IS NULL');
    } else {
      qb.andWhere(
        '(holiday.branch_id = :branchId OR holiday.branch_id IS NULL)',
        { branchId },
      );
    }

    return qb
      .orderBy('CASE WHEN holiday.branch_id IS NULL THEN 1 ELSE 0 END', 'ASC')
      .addOrderBy('CASE WHEN holiday.date = :scheduleDate THEN 0 ELSE 1 END', 'ASC')
      .addOrderBy('holiday.branch_id', 'DESC')
      .setParameter('scheduleDate', scheduleDate)
      .getOne();
  }

  private computeCycleDayIndex(
    startDate: string,
    targetDate: string,
    cycleDays: number,
  ): number {
    const start = new Date(`${startDate}T00:00:00Z`);
    const target = new Date(`${targetDate}T00:00:00Z`);
    const diff = Math.max(
      0,
      Math.floor((target.getTime() - start.getTime()) / 86400000),
    );
    return (diff % cycleDays) + 1;
  }

  private getDayOfWeek(date: string): number {
    return new Date(`${date}T00:00:00Z`).getUTCDay();
  }
}
