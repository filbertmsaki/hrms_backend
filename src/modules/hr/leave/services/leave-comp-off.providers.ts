import { Injectable, Logger, Optional, Provider } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitLeaveLifecycle } from '../utils/leave-lifecycle-notify.util';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeaveBalanceLedgerService } from './leave-balance-ledger.service';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveCompOffService } from './leave-comp-off.service';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';

/** Nest wiring for the framework-free LeaveCompOffService. */
export const LeaveCompOffServiceProvider: Provider = {
  provide: LeaveCompOffService,
  inject: [DataSource, LeaveBalanceLedgerService, LeaveBalanceService],
  useFactory: (
    dataSource: DataSource,
    ledger: LeaveBalanceLedgerService,
    balances: LeaveBalanceService,
  ) =>
    new LeaveCompOffService(
      dataSource,
      ledger,
      async (
        m: EntityManager,
        companyId,
        employeeId,
        leaveTypeId,
        leaveYear,
      ) => {
        const employee = await m
          .getRepository(Employee)
          .findOneOrFail({ where: { id: employeeId, company_id: companyId } });
        // Creates the year's balance row if missing, then locks it.
        await balances.ensureBalancesForEmployeeYear(
          companyId,
          employee,
          leaveYear,
          m,
          leaveTypeId,
        );
        return m.getRepository(LeaveBalance).findOneOrFail({
          where: {
            employee_id: employeeId,
            leave_type_id: leaveTypeId,
            fiscal_year: leaveYear,
          },
          lock: { mode: 'pessimistic_write' },
        });
      },
      async (m: EntityManager, companyId, employeeId, leaveTypeId) => {
        const employee = await m
          .getRepository(Employee)
          .findOneOrFail({ where: { id: employeeId, company_id: companyId } });
        const assignment = await balances.resolvePolicyAssignment(
          companyId,
          employee,
          leaveTypeId,
          m,
        );
        const accrual = balances.effectiveAccrual(assignment);
        return {
          leaveYearFor: (date: string) =>
            balances.cycleForDate(accrual, date, employee).label,
          maximumDays: balances.maximumAccumulationDays(assignment),
          policyReference: assignment
            ? `leave_policy:${assignment.policy.id}`
            : null,
        };
      },
    ),
};

/** Daily expiry of due comp-off credits (no-op while no credits exist). */
@Injectable()
export class LeaveCompOffExpiryCron {
  private readonly logger = new Logger(LeaveCompOffExpiryCron.name);
  constructor(
    private readonly dataSource: DataSource,
    private readonly compOff: LeaveCompOffService,
    private readonly locks: PostgresAdvisoryLockService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async run(today = new Date().toISOString().slice(0, 10)): Promise<void> {
    // One instance at a time across app replicas; expiry itself is idempotent.
    await this.locks.runWithLock('leave-comp-off-expiry', () =>
      this.expireAll(today),
    );
  }

  async expireAll(today: string): Promise<void> {
    const companies: Array<{ company_id: number }> =
      await this.dataSource.query(
        `SELECT DISTINCT company_id FROM leave_comp_off_credits WHERE status='credited' AND expires_on < $1`,
        [today],
      );
    for (const { company_id } of companies) {
      try {
        const result = await this.compOff.expireDue(company_id, today);
        if (result.expired) {
          this.logger.log(
            `company ${company_id}: expired ${result.expired} comp-off credit(s), ${result.days} day(s)`,
          );
          // Notify per credit; the dedupe key keeps it to one notice each.
          const expired: Array<{
            id: number;
            employee_id: number;
            days: string;
            expires_on: string;
          }> = await this.dataSource.query(
            `SELECT id, employee_id, days, expires_on::text AS expires_on FROM leave_comp_off_credits
                WHERE company_id=$1 AND status='expired' AND expires_on >= ($2::date - 7) AND expires_on < $2::date`,
            [company_id, today],
          );
          for (const credit of expired) {
            emitLeaveLifecycle(this.eventEmitter, {
              companyId: company_id,
              eventKey: 'leave.comp_off.expired',
              title: 'Compensatory off expired',
              message: `Unused compensatory off from credit #${credit.id} expired on ${credit.expires_on}.`,
              employeeId: credit.employee_id,
              entityType: 'LEAVE_COMP_OFF_CREDIT',
              entityId: credit.id,
              actionUrl: '/dashboard/self-service',
              dedupeKey: `leave-comp-off:${credit.id}:expired`,
            });
          }
        }
      } catch (error) {
        this.logger.error(
          `comp-off expiry failed for company ${company_id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
