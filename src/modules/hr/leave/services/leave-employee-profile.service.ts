import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  LeaveEmployeeProfile,
  LeaveEmploymentPeriod,
} from '../entities/leave-employee-profile.entity';
import { LeaveAuditService } from './leave-audit.service';

export type LeaveProfileInput = {
  effectiveDate: string;
  jurisdiction: 'mainland' | 'zanzibar';
  fte: number;
  cycleAnchorDate?: string | null;
  previousEmploymentPeriods: LeaveEmploymentPeriod[];
  reason: string;
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

@Injectable()
export class LeaveEmployeeProfileService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: HrAccessService,
    private readonly audit: LeaveAuditService,
  ) {}

  private async authorizedEmployee(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
  ): Promise<Employee> {
    const employee = await this.dataSource
      .getRepository(Employee)
      .findOne({ where: { id: employeeId, company_id: companyId } });
    if (!employee) throw new NotFoundException('Employee not found');
    await this.access.assertCanAccessEmployee(actor, employee);
    return employee;
  }

  async asOf(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
    date: string,
  ) {
    if (!validDate(date)) throw new BadRequestException('Invalid as-of date');
    await this.authorizedEmployee(companyId, employeeId, actor);
    return this.dataSource.getRepository(LeaveEmployeeProfile).findOne({
      where: {
        company_id: companyId,
        employee_id: employeeId,
        effective_date: LessThanOrEqual(date),
      },
      order: { effective_date: 'DESC', id: 'DESC' },
    });
  }

  async create(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
    input: LeaveProfileInput,
  ) {
    const employee = await this.authorizedEmployee(
      companyId,
      employeeId,
      actor,
    );
    if (!actor.companyMembershipId || !input.reason.trim())
      throw new BadRequestException(
        'A company membership and reason are required',
      );
    if (
      !validDate(input.effectiveDate) ||
      (input.cycleAnchorDate != null && !validDate(input.cycleAnchorDate))
    )
      throw new BadRequestException('Invalid profile date');
    if (
      !Number.isFinite(input.fte) ||
      input.fte <= 0 ||
      input.fte > 1 ||
      Math.abs(input.fte * 10000 - Math.round(input.fte * 10000)) > 1e-8
    )
      throw new BadRequestException(
        'FTE must be greater than zero and at most one, with up to four decimals',
      );
    if (!['mainland', 'zanzibar'].includes(input.jurisdiction))
      throw new BadRequestException('Invalid jurisdiction');
    if (
      !Array.isArray(input.previousEmploymentPeriods) ||
      input.previousEmploymentPeriods.length > 100 ||
      (input.previousEmploymentPeriods.length && !employee.hire_date)
    )
      throw new BadRequestException(
        'Previous employment periods require a current hire date',
      );
    if (
      input.previousEmploymentPeriods.some(
        (period) =>
          !period ||
          typeof period.start_date !== 'string' ||
          typeof period.end_date !== 'string',
      )
    )
      throw new BadRequestException('Invalid employment period');
    const periods = [...input.previousEmploymentPeriods].sort((a, b) =>
      a.start_date.localeCompare(b.start_date),
    );
    for (let i = 0; i < periods.length; i++) {
      const period = periods[i];
      if (
        !validDate(period.start_date) ||
        !validDate(period.end_date) ||
        period.start_date > period.end_date ||
        (employee.hire_date &&
          period.end_date >= String(employee.hire_date).slice(0, 10)) ||
        (i > 0 && periods[i - 1].end_date >= period.start_date)
      )
        throw new BadRequestException(
          'Previous employment periods must be valid, non-overlapping, and end before the current hire date',
        );
    }
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LeaveEmployeeProfile);
      const record = await repo.save(
        repo.create({
          company_id: companyId,
          employee_id: employeeId,
          effective_date: input.effectiveDate,
          jurisdiction: input.jurisdiction,
          fte: input.fte.toFixed(4),
          cycle_anchor_date: input.cycleAnchorDate ?? null,
          previous_employment_periods: periods,
          reason: input.reason.trim(),
          created_by_company_user_id: actor.companyMembershipId,
        }),
      );
      await this.audit.log(
        {
          company_id: companyId,
          action: 'leave_employee_profile.created',
          entity_name: 'employee',
          entity_id: employeeId,
          actor,
          payload: {
            profile_id: record.id,
            effective_date: record.effective_date,
            jurisdiction: record.jurisdiction,
            fte: record.fte,
            cycle_anchor_date: record.cycle_anchor_date,
            previous_employment_periods: periods,
            reason: record.reason,
          },
        },
        manager,
      );
      return { ...record, applied_to_leave_engine: false };
    });
  }
}
