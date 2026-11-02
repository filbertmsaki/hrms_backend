import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { AttendanceHoliday } from '../holidays/entities/holiday.entity';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../timetable/employee-timetables/enums/employee-timetable-status.enum';
import { TimetableDay } from '../timetable/timetable-days/entities/timetable-day.entity';
import { TimetableDayShiftOption } from '../timetable/timetable-days/entities/timetable-day-shift-option.entity';
import { TimetableHolidayActionTypeEnum } from '../timetable/timetable-holiday-rules/enums/timetable-holiday-action-type.enum';
import { TimetableHolidayRule } from '../timetable/timetable-holiday-rules/entities/timetable-holiday-rule.entity';
import { TimetableRotationRule } from '../timetable/timetable-rotation-rules/entities/timetable-rotation-rule.entity';
import { TimetableRotation } from '../timetable/timetable-rotations/entities/timetable-rotation.entity';
import { TimetableRotationStatusEnum } from '../timetable/timetable-rotations/enums/timetable-rotation-status.enum';
import { Timetable } from '../timetable/timetables/entities/timetable.entity';
import { TimetableStatusEnum } from '../timetable/timetables/enums/timetable-status.enum';
import { TimetableTypeEnum } from '../timetable/timetables/enums/timetable-type.enum';
import { formatDateOnly } from '../../shared/hr.utils';

type TimetableScheduleSourceRule = 'DAY' | 'ROTATION' | 'OVERRIDE';

export type TimetableScheduleDefinition = {
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
  sourceRule: TimetableScheduleSourceRule;
  expectedCheckInTime: string | null;
  expectedCheckOutTime: string | null;
  overtimeAllowed: boolean | null;
  assignmentSource: 'EMPLOYEE_TIMETABLE' | 'COMPANY_DEFAULT_TIMETABLE';
};

type TimetableBaseSchedule = {
  shiftId: number | null;
  isOffDay: boolean;
  generatedFromRotation: boolean;
  sourceRule: TimetableScheduleSourceRule;
  expectedCheckInTime: string | null;
  expectedCheckOutTime: string | null;
  overtimeAllowed: boolean | null;
};

type TimetableResolutionContext = {
  timetable: Timetable;
  effectiveFrom: string;
  assignmentSource: 'EMPLOYEE_TIMETABLE' | 'COMPANY_DEFAULT_TIMETABLE';
};

const TIMETABLE_DEFINITION_RANGE_CONCURRENCY = 8;

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
    @InjectRepository(TimetableDayShiftOption)
    private readonly timetableDayShiftOptionRepository: Repository<TimetableDayShiftOption>,
    @InjectRepository(TimetableHolidayRule)
    private readonly timetableHolidayRuleRepository: Repository<TimetableHolidayRule>,
    @InjectRepository(AttendanceHoliday)
    private readonly holidayRepository: Repository<AttendanceHoliday>,
    @InjectRepository(TimetableRotation)
    private readonly timetableRotationRepository: Repository<TimetableRotation>,
    @InjectRepository(TimetableRotationRule)
    private readonly timetableRotationRuleRepository: Repository<TimetableRotationRule>,
  ) {}

  async buildScheduleDefinition(
    companyId: number,
    employeeId: number,
    scheduleDate: string,
  ): Promise<TimetableScheduleDefinition | null> {
    const employee = await this.findEmployee(companyId, employeeId);
    const resolution = await this.resolveTimetableContext(
      companyId,
      employeeId,
      scheduleDate,
      employee,
    );
    if (!resolution) {
      return null;
    }

    return this.buildScheduleDefinitionFromContext(
      companyId,
      employeeId,
      scheduleDate,
      employee,
      resolution,
    );
  }

  async buildScheduleDefinitions(
    companyId: number,
    employeeId: number,
    scheduleDates: string[],
  ): Promise<Array<TimetableScheduleDefinition | null>> {
    if (!scheduleDates.length) return [];
    const employee = await this.findEmployee(companyId, employeeId);
    const orderedDates = [...scheduleDates].sort();
    const dateFrom = orderedDates[0];
    const dateTo = orderedDates[orderedDates.length - 1];
    const assignments = await this.employeeTimetableRepository
      .createQueryBuilder('assignment')
      .where('assignment.company_id = :companyId', { companyId })
      .andWhere('assignment.employee_id = :employeeId', { employeeId })
      .andWhere('assignment.status = :status', {
        status: EmployeeTimetableStatusEnum.ACTIVE,
      })
      .andWhere('assignment.effective_from <= :dateTo', { dateTo })
      .andWhere(
        '(assignment.effective_to IS NULL OR assignment.effective_to >= :dateFrom)',
        { dateFrom },
      )
      .orderBy('assignment.effectiveFrom', 'DESC')
      .getMany();
    const timetableIds = [
      ...new Set(assignments.map((row) => row.timetableId)),
    ];
    const assignedTimetables = timetableIds.length
      ? await this.timetableRepository.find({
          where: { companyId, id: In(timetableIds) },
        })
      : [];
    const timetableById = new Map(
      assignedTimetables.map((timetable) => [timetable.id, timetable]),
    );
    const hasUnassignedDate = scheduleDates.some(
      (date) =>
        !assignments.some(
          (assignment) =>
            assignment.effectiveFrom <= date &&
            (!assignment.effectiveTo || assignment.effectiveTo >= date),
        ),
    );
    const defaultTimetable = hasUnassignedDate
      ? await this.timetableRepository.findOne({
          where: {
            companyId,
            isDefault: true,
            status: TimetableStatusEnum.ACTIVE,
          },
          order: { updatedAt: 'DESC', id: 'DESC' },
        })
      : null;

    const buildDefinition = async (scheduleDate: string) => {
      const assignment = assignments.find(
        (candidate) =>
          candidate.effectiveFrom <= scheduleDate &&
          (!candidate.effectiveTo || candidate.effectiveTo >= scheduleDate),
      );
      const resolution: TimetableResolutionContext | null = assignment
        ? timetableById.has(assignment.timetableId)
          ? {
              timetable: timetableById.get(assignment.timetableId)!,
              effectiveFrom: assignment.effectiveFrom,
              assignmentSource: 'EMPLOYEE_TIMETABLE',
            }
          : null
        : defaultTimetable
          ? {
              timetable: defaultTimetable,
              effectiveFrom:
                employee?.hire_date ||
                formatDateOnly(defaultTimetable.createdAt) ||
                scheduleDate,
              assignmentSource: 'COMPANY_DEFAULT_TIMETABLE',
            }
          : null;
      return resolution
        ? this.buildScheduleDefinitionFromContext(
            companyId,
            employeeId,
            scheduleDate,
            employee,
            resolution,
          )
        : null;
    };
    const definitions: Array<TimetableScheduleDefinition | null> = [];
    for (
      let offset = 0;
      offset < scheduleDates.length;
      offset += TIMETABLE_DEFINITION_RANGE_CONCURRENCY
    ) {
      definitions.push(
        ...(await Promise.all(
          scheduleDates
            .slice(offset, offset + TIMETABLE_DEFINITION_RANGE_CONCURRENCY)
            .map(buildDefinition),
        )),
      );
    }
    return definitions;
  }

  private async buildScheduleDefinitionFromContext(
    companyId: number,
    employeeId: number,
    scheduleDate: string,
    employee: Employee | null,
    resolution: TimetableResolutionContext,
  ): Promise<TimetableScheduleDefinition | null> {
    const { timetable, effectiveFrom, assignmentSource } = resolution;
    const branchId = employee?.primary_branch_id ?? null;
    const holiday = await this.resolveHoliday(
      companyId,
      branchId,
      scheduleDate,
    );
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
            effectiveFrom,
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
        generatedFromRotation:
          timetable.timetableType === TimetableTypeEnum.ROTATIONAL,
        sourceRule: 'OVERRIDE',
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
      sourceRule: holidayRule ? 'OVERRIDE' : baseSchedule.sourceRule,
      expectedCheckInTime: baseSchedule.expectedCheckInTime,
      expectedCheckOutTime: baseSchedule.expectedCheckOutTime,
      overtimeAllowed: baseSchedule.overtimeAllowed,
      assignmentSource,
    };
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
      .orderBy('assignment.effectiveFrom', 'DESC')
      .getOne();
  }

  private async resolveTimetableContext(
    companyId: number,
    employeeId: number,
    scheduleDate: string,
    employee: Employee | null,
  ): Promise<TimetableResolutionContext | null> {
    const assignment = await this.findActiveAssignment(
      companyId,
      employeeId,
      scheduleDate,
    );
    if (assignment) {
      const timetable = await this.timetableRepository.findOne({
        where: { id: assignment.timetableId, companyId },
      });
      if (!timetable) {
        return null;
      }

      return {
        timetable,
        effectiveFrom: assignment.effectiveFrom,
        assignmentSource: 'EMPLOYEE_TIMETABLE',
      };
    }

    const timetable = await this.timetableRepository.findOne({
      where: {
        companyId,
        isDefault: true,
        status: TimetableStatusEnum.ACTIVE,
      },
      order: { updatedAt: 'DESC', id: 'DESC' },
    });
    if (!timetable) {
      return null;
    }

    return {
      timetable,
      effectiveFrom:
        employee?.hire_date ||
        formatDateOnly(timetable.createdAt) ||
        scheduleDate,
      assignmentSource: 'COMPANY_DEFAULT_TIMETABLE',
    };
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
            sourceRule: 'DAY',
            expectedCheckInTime: null,
            expectedCheckOutTime: null,
            overtimeAllowed: null,
          }
        : null;
    }

    const options = await this.timetableDayShiftOptionRepository.find({
      where: { timetableDayId: day.id, isPrimary: true },
      order: { priorityOrder: 'ASC', id: 'ASC' },
    });
    const configuredOptions =
      await this.timetableDayShiftOptionRepository.count({
        where: { timetableDayId: day.id },
      });
    const primaryOption = options[0];
    return {
      shiftId:
        configuredOptions > 0
          ? primaryOption && (primaryOption.maxEmployees ?? null) === null
            ? primaryOption.shiftId
            : null
          : (day.defaultShiftId ?? null),
      isOffDay: !day.isWorkingDay,
      generatedFromRotation: false,
      sourceRule: 'DAY',
      expectedCheckInTime: day.expectedCheckInTime ?? null,
      expectedCheckOutTime: day.expectedCheckOutTime ?? null,
      overtimeAllowed: day.overtimeAllowed,
    };
  }

  private async resolveRotationalBaseSchedule(
    timetable: Timetable,
    effectiveFrom: string,
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
      effectiveFrom,
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
      sourceRule: 'ROTATION',
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

    if (
      holidayRule.actionType === TimetableHolidayActionTypeEnum.WORKING_HOLIDAY
    ) {
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
        "(holiday.date = :scheduleDate OR (holiday.is_recurring = :isRecurring AND TO_CHAR(holiday.date, 'MM-DD') = :monthDay))",
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
      .addOrderBy(
        'CASE WHEN holiday.date = :scheduleDate THEN 0 ELSE 1 END',
        'ASC',
      )
      .addOrderBy('holiday.branchId', 'DESC')
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
