import { Injectable } from '@nestjs/common';
import { EntityManager, IsNull, LessThanOrEqual } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { Department } from '../departments/entities/department.entity';
import { Position } from '../positions/entities/position.entity';
import { Branch } from '../branches/entities/branch.entity';
import { EmployeeGrade } from '../grades/entities/employee-grade.entity';
import {
  EmployeeCompensationVersion,
  EmployeeCompensationVersionStatusEnum,
} from '../employee-movements/entities/employee-compensation-version.entity';
import { EmployeePayrollProfile } from '../payroll/entities/employee-payroll-profile.entity';
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../attendance/timetable/employee-timetables/enums/employee-timetable-status.enum';
import { TimetableDay } from '../attendance/timetable/timetable-days/entities/timetable-day.entity';
import { ShiftAssignment } from '../attendance/shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftAssignmentStatusEnum } from '../attendance/shift/shift-assignments/enums/shift-assignment-status.enum';
import { LeaveType } from '../leave/entities/leave-type.entity';
import { LeaveBalanceService } from '../leave/services/leave-balance.service';
import { ProbationPolicyResolverService } from '../probation/services/probation-policy-resolver.service';
import { EmploymentContract } from './entities/employment-contract.entity';
import {
  ContractRefKey,
  describeWorkingTime,
  humanizeCode,
  probationFromPolicyDays,
  readRefs,
} from './contract-live-values';

export type LiveValueKey =
  | 'department'
  | 'job_title'
  | 'grade'
  | 'work_location'
  | 'reporting_manager'
  | 'salary'
  | 'currency'
  | 'pay_frequency'
  | 'remuneration_method'
  | 'hours_of_work'
  | 'probation_months'
  | 'annual_leave_days'
  | 'employment_basis';

export type LiveResolution = {
  values: Partial<Record<LiveValueKey, string>>;
  /** Where each value came from, shown next to the field ("From probation policy X"). */
  sources: Partial<Record<LiveValueKey, string>>;
  /** Values that need HR's attention (e.g. D3 probation not in whole months). */
  warnings: Partial<Record<LiveValueKey, string>>;
  /** IDs actually used (override or employee's current record). */
  refs: Partial<Record<ContractRefKey, number | null>>;
  automaticRefs: Partial<Record<ContractRefKey, { id: number | null; label: string | null }>>;
};

/**
 * Resolves live contract values from HR records for "live" drafts. Read-only;
 * reuses the probation and leave policy resolvers rather than re-implementing
 * policy matching.
 */
@Injectable()
export class ContractLiveValuesService {
  constructor(
    private readonly probation: ProbationPolicyResolverService,
    private readonly leave: LeaveBalanceService,
  ) {}

  async automaticReferences(employee: Employee, companyId: number, manager: EntityManager): Promise<LiveResolution['automaticRefs']> {
    const [department, position, grade, branch, reporting] = await Promise.all([
      employee.primary_department_id ? manager.getRepository(Department).findOneBy({ id: employee.primary_department_id, company_id: companyId }) : null,
      employee.primary_position_id ? manager.getRepository(Position).findOneBy({ id: employee.primary_position_id, company_id: companyId }) : null,
      employee.grade_id ? manager.getRepository(EmployeeGrade).findOneBy({ id: employee.grade_id, company_id: companyId }) : null,
      employee.primary_branch_id ? manager.getRepository(Branch).findOneBy({ id: employee.primary_branch_id, company_id: companyId }) : null,
      employee.reports_to ? manager.getRepository(Employee).findOneBy({ id: employee.reports_to, company_id: companyId }) : null,
    ]);
    return {
      department_id: { id: department?.id ?? null, label: department?.name ?? null },
      position_id: { id: position?.id ?? null, label: position?.name ?? null },
      grade_id: { id: grade?.id ?? null, label: grade?.name ?? null },
      branch_id: { id: branch?.id ?? null, label: branch?.name ?? null },
      reports_to_id: { id: reporting?.id ?? null, label: reporting ? `${reporting.first_name} ${reporting.last_name}`.trim() : null },
    };
  }

  async resolve(
    contract: EmploymentContract,
    employee: Employee,
    fallbackAnnualLeaveDays: number,
    manager: EntityManager,
  ): Promise<LiveResolution> {
    const companyId = contract.companyId;
    const overrides = readRefs(contract.particulars);
    const refs: LiveResolution['refs'] = {
      department_id:
        overrides.department_id ?? employee.primary_department_id ?? null,
      position_id:
        overrides.position_id ?? employee.primary_position_id ?? null,
      grade_id: overrides.grade_id ?? employee.grade_id ?? null,
      branch_id: overrides.branch_id ?? employee.primary_branch_id ?? null,
      reports_to_id: overrides.reports_to_id ?? employee.reports_to ?? null,
    };
    // Policies are matched against the assignment the contract describes.
    const scoped = Object.assign(Object.create(Employee.prototype), employee, {
      primary_department_id: refs.department_id,
      primary_position_id: refs.position_id,
      primary_branch_id: refs.branch_id,
      grade_id: refs.grade_id,
    }) as Employee;
    const onDate = contract.startDate;
    const values: LiveResolution['values'] = {};
    const sources: LiveResolution['sources'] = {};
    const warnings: LiveResolution['warnings'] = {};
    const fromRef = (key: ContractRefKey) =>
      overrides[key] ? 'Selected for this contract' : 'Current assignment';

    const [
      department,
      position,
      grade,
      branch,
      reportsTo,
      compensation,
      payrollProfile,
    ] = await Promise.all([
      refs.department_id
        ? manager
            .getRepository(Department)
            .findOneBy({ id: refs.department_id, company_id: companyId })
        : null,
      refs.position_id
        ? manager
            .getRepository(Position)
            .findOneBy({ id: refs.position_id, company_id: companyId })
        : null,
      refs.grade_id
        ? manager
            .getRepository(EmployeeGrade)
            .findOneBy({ id: refs.grade_id, company_id: companyId })
        : null,
      refs.branch_id
        ? manager
            .getRepository(Branch)
            .findOneBy({ id: refs.branch_id, company_id: companyId })
        : null,
      refs.reports_to_id
        ? manager.getRepository(Employee).findOneBy({
            id: refs.reports_to_id,
            company_id: companyId,
          })
        : null,
      manager.getRepository(EmployeeCompensationVersion).findOne({
        where: {
          companyId,
          employeeId: employee.id,
          status: EmployeeCompensationVersionStatusEnum.ACTIVE,
        },
        order: { effectiveFrom: 'DESC' },
      }),
      manager
        .getRepository(EmployeePayrollProfile)
        .findOneBy({ companyId, employeeId: employee.id }),
    ]);

    const automaticRefs = await this.automaticReferences(employee, companyId, manager);

    const set = (key: LiveValueKey, value: unknown, source: string) => {
      const text =
        typeof value === 'string' || typeof value === 'number'
          ? String(value).trim()
          : '';
      if (!text) return;
      values[key] = text;
      sources[key] = source;
    };
    set('department', department?.name, fromRef('department_id'));
    set('job_title', position?.name, fromRef('position_id'));
    set('grade', grade?.name, fromRef('grade_id'));
    set('work_location', branch?.name, fromRef('branch_id'));
    set(
      'reporting_manager',
      reportsTo
        ? `${reportsTo.first_name} ${reportsTo.last_name}`.trim()
        : null,
      fromRef('reports_to_id'),
    );
    if (compensation) {
      const label = `Compensation effective ${compensation.effectiveFrom}`;
      set('salary', compensation.baseSalary, label);
      set('currency', compensation.currency, label);
      set('pay_frequency', compensation.payFrequency?.toLowerCase(), label);
    }
    set(
      'remuneration_method',
      humanizeCode(payrollProfile?.paymentMethod),
      'Payroll profile',
    );

    const hours = await this.resolveHours(manager, companyId, employee, onDate);
    if (hours) set('hours_of_work', hours.text, hours.source);

    const policy = await this.probation.resolve(companyId, scoped, onDate);
    if (policy) {
      const { months, warning } = probationFromPolicyDays(
        policy.probationPeriodDays,
      );
      if (months !== null)
        set('probation_months', months, `Probation policy: ${policy.name}`);
      if (warning) warnings.probation_months = warning;
    }

    const annual = await manager
      .getRepository(LeaveType)
      .findOneBy({ company_id: companyId, code: 'ANNUAL' });
    const assignment = annual
      ? await this.leave.resolvePolicyAssignment(
          companyId,
          scoped,
          annual.id,
          manager,
        )
      : null;
    if (assignment)
      set(
        'annual_leave_days',
        Number(assignment.annualQuotaDays),
        `Leave policy: ${assignment.policy.name}`,
      );
    else
      set(
        'annual_leave_days',
        fallbackAnnualLeaveDays,
        'Company contract settings',
      );

    set(
      'employment_basis',
      contract.particulars?.part_time === true ? 'part-time' : 'full-time',
      'Contract',
    );
    return { values, sources, warnings, refs, automaticRefs };
  }

  /** Active timetable first (it knows working days), else the primary shift. */
  private async resolveHours(
    manager: EntityManager,
    companyId: number,
    employee: Employee,
    onDate: string,
  ): Promise<{ text: string; source: string } | null> {
    const activeOn = <T>(
      rows: T[],
      from: (r: T) => string,
      to: (r: T) => string | null,
    ) =>
      rows.find((row) => {
        const end = to(row);
        return from(row) <= onDate && (!end || end >= onDate);
      }) ??
      rows.find((row) => !to(row)) ??
      null;

    const timetables = await manager.getRepository(EmployeeTimetable).find({
      where: {
        companyId,
        employeeId: employee.id,
        status: EmployeeTimetableStatusEnum.ACTIVE,
      },
      relations: { timetable: true },
      order: { effectiveFrom: 'DESC' },
    });
    const timetable = activeOn(
      timetables,
      (row) => row.effectiveFrom,
      (row) => row.effectiveTo,
    );
    if (timetable) {
      const days = await manager.getRepository(TimetableDay).find({
        where: { timetableId: timetable.timetableId },
        relations: { defaultShift: true },
      });
      const text = describeWorkingTime(
        days.map((day) => ({
          dayOfWeek: day.dayOfWeek,
          isWorkingDay: day.isWorkingDay,
          start: day.expectedCheckInTime ?? day.defaultShift?.startTime ?? null,
          end: day.expectedCheckOutTime ?? day.defaultShift?.endTime ?? null,
        })),
      );
      if (text)
        return {
          text,
          source: `Timetable: ${timetable.timetable?.name ?? timetable.timetableId}`,
        };
    }

    const shifts = await manager.getRepository(ShiftAssignment).find({
      where: [
        {
          companyId,
          employeeId: employee.id,
          status: ShiftAssignmentStatusEnum.ACTIVE,
          isPrimary: true,
          effectiveFrom: LessThanOrEqual(onDate),
        },
        {
          companyId,
          employeeId: employee.id,
          status: ShiftAssignmentStatusEnum.ACTIVE,
          isPrimary: true,
          effectiveTo: IsNull(),
        },
      ],
      relations: { shift: true },
      order: { effectiveFrom: 'DESC' },
    });
    const shift = activeOn(
      shifts,
      (row) => row.effectiveFrom,
      (row) => row.effectiveTo,
    );
    const start = shift?.shift?.startTime?.slice(0, 5);
    const end = shift?.shift?.endTime?.slice(0, 5);
    if (shift && start && end)
      return { text: `${start}–${end}`, source: `Shift: ${shift.shift.name}` };
    return null;
  }
}
