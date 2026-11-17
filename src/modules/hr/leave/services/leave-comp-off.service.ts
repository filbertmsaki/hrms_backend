import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import type { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { LeaveBalance } from '../entities/leave-balance.entity';
import {
  CompOffSourceType,
  LeaveCompOffCredit,
  LeaveCompOffPolicy,
} from '../entities/leave-comp-off.entity';
import { LeaveBalanceAdjustmentModeEnum } from '../enums/leave-balance-adjustment-mode.enum';
import { calculateAvailableLeaveDays } from '../utils/leave-balance-rules.util';
import { LeaveBalanceLedgerService } from './leave-balance-ledger.service';

/** Locks (or creates) the employee's balance for the comp-off leave type and year. */
export type CompOffBalanceProvider = (
  manager: EntityManager,
  companyId: number,
  employeeId: number,
  leaveTypeId: number,
  leaveYear: string,
) => Promise<LeaveBalance>;

const round2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * FRS-11.1.09 compensatory-off lifecycle: earn (source-linked, once per
 * source) → approve → credit to the ledger → used by ordinary leave requests
 * on the comp-off leave type → expire (FIFO, unused part only) or reverse.
 *
 * Disabled by default: earning requires the leave type's comp_off_enabled
 * flag AND an HR-approved LeaveCompOffPolicy with a conversion rate. Overtime
 * converted to comp-off is excluded from overtime pay (see payroll).
 */
export class LeaveCompOffService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ledger: LeaveBalanceLedgerService,
    private readonly balanceFor: CompOffBalanceProvider,
  ) {}

  /** Policy that allows earning, or a clear reason why earning is off. */
  async activePolicy(
    companyId: number,
    leaveTypeId: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<LeaveCompOffPolicy> {
    const [type] = await manager.query<Array<{ comp_off_enabled: boolean }>>(
      `SELECT comp_off_enabled FROM leave_types WHERE id=$1 AND company_id=$2`,
      [leaveTypeId, companyId],
    );
    if (!type) throw new NotFoundException('Leave type not found');
    if (!type.comp_off_enabled)
      throw new BadRequestException(
        'Compensatory off is not enabled for this leave type.',
      );
    const policy = await manager.getRepository(LeaveCompOffPolicy).findOne({
      where: { company_id: companyId, leave_type_id: leaveTypeId },
    });
    if (
      !policy ||
      policy.status !== 'approved' ||
      !(Number(policy.hours_per_day) > 0)
    )
      throw new BadRequestException(
        'Compensatory off has no HR-approved policy with a conversion rate; no credit can be earned.',
      );
    return policy;
  }

  async earn(
    companyId: number,
    input: {
      employeeId: number;
      leaveTypeId: number;
      sourceType: CompOffSourceType;
      sourceReference: string;
      workDate?: string;
      hours?: number;
    },
    actor: AuthenticatedUser | null,
  ): Promise<{ credit: LeaveCompOffCredit; created: boolean }> {
    try {
      return await this.dataSource.transaction(async (m) => {
        const policy = await this.activePolicy(companyId, input.leaveTypeId, m);
        if (!policy.allowed_sources.includes(input.sourceType))
          throw new BadRequestException(
            `${input.sourceType} does not earn comp-off under the approved policy.`,
          );
        const [employee] = await m.query<
          Array<{ id: number; employment_type: string | null }>
        >(
          `SELECT id, employment_type::text AS employment_type FROM employees WHERE id=$1 AND company_id=$2`,
          [input.employeeId, companyId],
        );
        if (!employee) throw new NotFoundException('Employee not found');
        if (
          policy.eligible_employment_types?.length &&
          !policy.eligible_employment_types.includes(
            String(employee.employment_type),
          )
        )
          throw new BadRequestException(
            'This employee is not eligible for compensatory off.',
          );

        let workDate = input.workDate;
        let hours = Number(input.hours);
        if (input.sourceType === 'OVERTIME_REQUEST') {
          // Source of truth is the approved overtime request itself.
          const [ot] = await m.query<
            Array<{
              id: number;
              employee_id: number;
              status: string;
              work_date: string;
              requested_minutes: number;
            }>
          >(
            `SELECT id, employee_id, status, work_date::text AS work_date, requested_minutes
               FROM payroll_overtime_requests WHERE id=$1 AND company_id=$2 FOR UPDATE`,
            [Number(input.sourceReference), companyId],
          );
          if (!ot || ot.employee_id !== input.employeeId)
            throw new NotFoundException(
              'Overtime request not found for this employee.',
            );
          if (ot.status !== 'APPROVED')
            throw new BadRequestException(
              'Only approved overtime can earn compensatory off.',
            );
          workDate = ot.work_date;
          hours = Number(ot.requested_minutes) / 60;
        }
        if (!workDate || !(hours > 0))
          throw new BadRequestException(
            'Work date and positive hours are required.',
          );
        if (policy.minimum_hours && hours < Number(policy.minimum_hours))
          throw new BadRequestException(
            `At least ${policy.minimum_hours} hour(s) are needed to earn compensatory off.`,
          );
        let days = round2(hours / Number(policy.hours_per_day));
        if (policy.max_days_per_credit)
          days = Math.min(days, Number(policy.max_days_per_credit));
        if (!(days > 0))
          throw new BadRequestException('These hours convert to zero days.');

        const repo = m.getRepository(LeaveCompOffCredit);
        const credit = await repo.save(
          repo.create({
            company_id: companyId,
            employee_id: input.employeeId,
            leave_type_id: input.leaveTypeId,
            policy_id: policy.id,
            source_type: input.sourceType,
            source_reference: String(input.sourceReference),
            work_date: workDate,
            hours: hours.toFixed(2),
            days: days.toFixed(2),
            leave_year: workDate.slice(0, 4),
            expires_on: policy.expiry_days
              ? addDays(workDate, policy.expiry_days)
              : null,
            status: 'pending_approval',
            requested_by_company_user_id: actor?.companyMembershipId ?? null,
          }),
        );
        if (!policy.requires_approval) await this.post(m, credit, actor);
        return { credit, created: true };
      });
    } catch (error) {
      if (this.isUnique(error)) {
        const existing = await this.dataSource
          .getRepository(LeaveCompOffCredit)
          .findOneOrFail({
            where: {
              company_id: companyId,
              source_type: input.sourceType,
              source_reference: String(input.sourceReference),
            },
          });
        return { credit: existing, created: false };
      }
      throw error;
    }
  }

  async decide(
    companyId: number,
    creditId: number,
    approve: boolean,
    actor: AuthenticatedUser,
    reason?: string,
  ): Promise<LeaveCompOffCredit> {
    return this.dataSource.transaction(async (m) => {
      const credit = await this.lockCredit(m, companyId, creditId);
      if (credit.employee_id === actor.employeeId)
        throw new ForbiddenException(
          'You cannot approve your own compensatory off.',
        );
      if (credit.status !== 'pending_approval')
        throw new ConflictException(`This credit is already ${credit.status}.`);
      if (!approve) {
        credit.status = 'rejected';
        credit.closed_reason = reason?.trim() || null;
        return m.getRepository(LeaveCompOffCredit).save(credit);
      }
      await this.activePolicy(companyId, credit.leave_type_id, m);
      credit.approved_by_company_user_id = actor.companyMembershipId ?? null;
      credit.approved_at = new Date();
      return this.post(m, credit, actor);
    });
  }

  /** Withdraws an unused credit (e.g. the overtime was cancelled). */
  async reverse(
    companyId: number,
    creditId: number,
    actor: AuthenticatedUser,
    reason: string,
  ): Promise<LeaveCompOffCredit> {
    if ((reason?.trim().length ?? 0) < 5)
      throw new BadRequestException('Give a reason for the reversal.');
    return this.dataSource.transaction(async (m) => {
      const credit = await this.lockCredit(m, companyId, creditId);
      if (credit.status === 'reversed') return credit;
      if (credit.status !== 'credited')
        throw new ConflictException(
          `A ${credit.status} credit cannot be reversed.`,
        );
      const balance = await this.balanceFor(
        m,
        companyId,
        credit.employee_id,
        credit.leave_type_id,
        credit.leave_year,
      );
      const days = Number(credit.days);
      if (calculateAvailableLeaveDays(balance) + 1e-9 < days)
        throw new BadRequestException(
          'Part of this credit has already been used; cancel the leave that used it before reversing.',
        );
      const result = await this.ledger.applyManualAdjustment(
        balance,
        {
          companyId,
          employeeId: credit.employee_id,
          leaveTypeId: credit.leave_type_id,
          leaveYear: credit.leave_year,
          effectiveDate: new Date().toISOString().slice(0, 10),
          mode: LeaveBalanceAdjustmentModeEnum.DEDUCT,
          amount: days,
          reason: `Compensatory off reversed: ${reason.trim()}`,
          createdByCompanyUserId: actor.companyMembershipId ?? null,
          idempotencyKey: `comp-off:reverse:${credit.id}`,
          reference: `comp-off:${credit.source_type}:${credit.source_reference}`,
        },
        m,
      );
      credit.status = 'reversed';
      credit.closing_transaction_id = result.transaction.id;
      credit.closed_reason = reason.trim();
      return m.getRepository(LeaveCompOffCredit).save(credit);
    });
  }

  /**
   * Expires credits due before `today`. Leave is used oldest-credit-first, so
   * a due credit's unused part is what remains after newer live credits are
   * set aside; only that part is removed.
   */
  async expireDue(
    companyId: number,
    today: string,
  ): Promise<{ expired: number; days: number }> {
    const due = await this.dataSource.query<
      Array<{ employee_id: number; leave_type_id: number; leave_year: string }>
    >(
      `SELECT DISTINCT employee_id, leave_type_id, leave_year FROM leave_comp_off_credits
        WHERE company_id=$1 AND status='credited' AND expires_on < $2`,
      [companyId, today],
    );
    let expired = 0;
    let total = 0;
    for (const group of due as Array<{
      employee_id: number;
      leave_type_id: number;
      leave_year: string;
    }>) {
      await this.dataSource.transaction(async (m) => {
        const balance = await this.balanceFor(
          m,
          companyId,
          group.employee_id,
          group.leave_type_id,
          group.leave_year,
        );
        const credits = await m
          .getRepository(LeaveCompOffCredit)
          .createQueryBuilder('c')
          .setLock('pessimistic_write')
          .where(
            'c.company_id = :companyId AND c.employee_id = :e AND c.leave_type_id = :t AND c.leave_year = :y',
            {
              companyId,
              e: group.employee_id,
              t: group.leave_type_id,
              y: group.leave_year,
            },
          )
          .andWhere(`c.status = 'credited'`)
          .orderBy('c.work_date', 'ASC')
          .addOrderBy('c.id', 'ASC')
          .getMany();
        let available = Math.max(0, calculateAvailableLeaveDays(balance));
        for (let i = 0; i < credits.length; i++) {
          const credit = credits[i];
          if (!credit.expires_on || credit.expires_on >= today) continue;
          const newer = credits
            .slice(i + 1)
            .reduce((sum, c) => sum + Number(c.days), 0);
          const unused = round2(
            Math.max(0, Math.min(Number(credit.days), available - newer)),
          );
          if (unused > 0) {
            const result = await this.ledger.applyManualAdjustment(
              balance,
              {
                companyId,
                employeeId: credit.employee_id,
                leaveTypeId: credit.leave_type_id,
                leaveYear: credit.leave_year,
                effectiveDate: credit.expires_on,
                mode: LeaveBalanceAdjustmentModeEnum.DEDUCT,
                amount: unused,
                reason: `Compensatory off expired (earned ${credit.work_date})`,
                idempotencyKey: `comp-off:expire:${credit.id}`,
                reference: `comp-off:${credit.source_type}:${credit.source_reference}`,
              },
              m,
            );
            credit.closing_transaction_id = result.transaction.id;
            available = round2(available - unused);
          }
          credit.status = 'expired';
          credit.expired_days = unused.toFixed(2);
          credit.closed_reason = 'expired';
          await m.getRepository(LeaveCompOffCredit).save(credit);
          expired += 1;
          total = round2(total + unused);
          credits.splice(i, 1);
          i -= 1;
        }
      });
    }
    return { expired, days: total };
  }

  /** Earned, expired, reversed, used and remaining days per employee. */
  async utilization(companyId: number, leaveYear: string) {
    return this.dataSource.query<
      Array<{
        employee_id: number;
        leave_type_id: number;
        earned_days: number;
        expired_days: number;
        reversed_days: number;
        pending_days: number;
        used_days: number | null;
      }>
    >(
      `SELECT c.employee_id, c.leave_type_id,
              SUM(CASE WHEN c.status IN ('credited','expired','reversed') THEN c.days ELSE 0 END)::float AS earned_days,
              SUM(CASE WHEN c.status='expired' THEN c.expired_days ELSE 0 END)::float AS expired_days,
              SUM(CASE WHEN c.status='reversed' THEN c.days ELSE 0 END)::float AS reversed_days,
              SUM(CASE WHEN c.status='pending_approval' THEN c.days ELSE 0 END)::float AS pending_days,
              MAX(b.used_days)::float AS used_days
         FROM leave_comp_off_credits c
         LEFT JOIN leave_balances b ON b.employee_id=c.employee_id AND b.leave_type_id=c.leave_type_id AND b.fiscal_year=c.leave_year
        WHERE c.company_id=$1 AND c.leave_year=$2
        GROUP BY c.employee_id, c.leave_type_id
        ORDER BY c.employee_id`,
      [companyId, leaveYear],
    );
  }

  private async post(
    m: EntityManager,
    credit: LeaveCompOffCredit,
    actor: AuthenticatedUser | null,
  ) {
    const balance = await this.balanceFor(
      m,
      credit.company_id,
      credit.employee_id,
      credit.leave_type_id,
      credit.leave_year,
    );
    const result = await this.ledger.applyManualAdjustment(
      balance,
      {
        companyId: credit.company_id,
        employeeId: credit.employee_id,
        leaveTypeId: credit.leave_type_id,
        leaveYear: credit.leave_year,
        effectiveDate: credit.work_date,
        mode: LeaveBalanceAdjustmentModeEnum.ADD,
        amount: Number(credit.days),
        reason: `Compensatory off earned for ${credit.hours} h on ${credit.work_date}`,
        createdByCompanyUserId: actor?.companyMembershipId ?? null,
        idempotencyKey: `comp-off:credit:${credit.id}`,
        reference: `comp-off:${credit.source_type}:${credit.source_reference}`,
        metadata: { comp_off_credit_id: credit.id },
      },
      m,
    );
    credit.status = 'credited';
    credit.credit_transaction_id = result.transaction.id;
    return m.getRepository(LeaveCompOffCredit).save(credit);
  }

  private async lockCredit(m: EntityManager, companyId: number, id: number) {
    const credit = await m.getRepository(LeaveCompOffCredit).findOne({
      where: { id, company_id: companyId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!credit)
      throw new NotFoundException('Compensatory-off credit not found');
    return credit;
  }

  private isUnique(error: unknown) {
    return (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23505'
    );
  }
}
