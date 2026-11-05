import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource, In } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { OffboardingCompletedEvent } from '../../notifications/events';
import { OffboardingRequest } from '../../offboarding/entities/offboarding-request.entity';
import { LeaveExitSettlement } from '../entities/leave-exit-settlement.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import { LeaveService } from '../leave.service';
import {
  dailyProRataAccrual,
  roundLeaveDays,
} from '../utils/leave-accrual.util';
import { LeaveAuditService } from './leave-audit.service';
import { LeaveBalanceService } from './leave-balance.service';

const OPEN_STATUSES = [
  LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
  LeaveStatusEnum.PENDING_HR,
  LeaveStatusEnum.IN_REVIEW,
  LeaveStatusEnum.RETURNED_FOR_CORRECTION,
  LeaveStatusEnum.DRAFT,
  LeaveStatusEnum.APPROVED,
];

/**
 * Settles leave when an employee leaves: future leave is cancelled or cut at
 * the exit date, then each encashable or accruing leave type is settled as
 * earned-to-exit + carried + adjusted - used - deductions.
 */
@Injectable()
export class LeaveExitSettlementService {
  private readonly logger = new Logger(LeaveExitSettlementService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly leaveService: LeaveService,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly leaveAuditService: LeaveAuditService,
  ) {}

  @OnEvent(OffboardingCompletedEvent.EVENT)
  async onOffboardingCompleted(event: OffboardingCompletedEvent) {
    try {
      const request = await this.dataSource
        .getRepository(OffboardingRequest)
        .findOne({
          where: {
            id: event.offboardingRequestId,
            company_id: event.companyId,
          },
          select: ['id', 'employee_id', 'last_working_date'],
        });
      const exitDate = event.exitDate ?? request?.last_working_date ?? null;
      if (!request || !exitDate) return;
      await this.settle(
        event.companyId,
        request.employee_id,
        String(exitDate).slice(0, 10),
        this.systemActor(event.companyId, event.senderCompanyUserId),
        request.id,
      );
    } catch (error) {
      // Offboarding is already complete; HR can re-run settlement manually.
      this.logger.error(
        `Leave exit settlement failed for offboarding ${event.offboardingRequestId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async settle(
    companyId: number,
    employeeId: number,
    exitDate: string,
    actor: AuthenticatedUser,
    offboardingRequestId: number | null = null,
  ) {
    const employee = await this.dataSource.getRepository(Employee).findOne({
      where: { id: employeeId, company_id: companyId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const leaveActions = await this.closeFutureLeave(
      companyId,
      employeeId,
      exitDate,
      actor,
    );

    const year = exitDate.slice(0, 4);
    const balances =
      await this.leaveBalanceService.ensureBalancesForEmployeeYear(
        companyId,
        employee,
        year,
        undefined,
        undefined,
        true,
      );
    const repository = this.dataSource.getRepository(LeaveExitSettlement);
    const rows: LeaveExitSettlement[] = [];
    const n = (value: string | null | undefined) =>
      this.leaveBalanceService.toNumber(value);

    for (const balance of balances) {
      const assignment = await this.leaveBalanceService.resolvePolicyAssignment(
        companyId,
        employee,
        balance.leave_type_id,
      );
      const accrual = this.leaveBalanceService.effectiveAccrual(assignment);
      const accruing = this.leaveBalanceService.isAccruingPolicy(accrual);
      if (!accruing && !assignment?.policyType?.encashment_enabled) continue;

      const entitlement = n(balance.entitlement_days);
      // Accruing types use their method; others are pro-rated by days employed.
      const earned = accruing
        ? this.leaveBalanceService.accruedDaysAsOf(
            entitlement,
            accrual,
            year,
            employee,
            exitDate,
          )
        : dailyProRataAccrual({
            entitlementDays: entitlement,
            year,
            asOf: exitDate,
            employmentStartDate: employee.hire_date ?? null,
          });
      const carried = n(
        balance.opening_balance_days || balance.carried_forward_days,
      );
      const adjusted = n(balance.adjusted_days);
      const used = n(balance.used_days) + n(balance.approved_future_days);
      const deducted =
        n(balance.expired_days) + n(balance.attendance_deduction_days);
      const settlement = roundLeaveDays(
        carried + earned + adjusted - used - deducted,
      );

      const existing = await repository.findOne({
        where: {
          company_id: companyId,
          employee_id: employeeId,
          leave_type_id: balance.leave_type_id,
          exit_date: exitDate,
        },
      });
      if (existing && existing.status !== 'pending_payroll') {
        rows.push(existing);
        continue;
      }
      const row = existing ?? repository.create();
      Object.assign(row, {
        company_id: companyId,
        employee_id: employeeId,
        leave_type_id: balance.leave_type_id,
        offboarding_request_id: offboardingRequestId,
        exit_date: exitDate,
        earned_to_exit_days: this.leaveBalanceService.toDecimal(earned),
        carried_forward_days: this.leaveBalanceService.toDecimal(carried),
        adjusted_days: this.leaveBalanceService.toDecimal(adjusted),
        used_days: this.leaveBalanceService.toDecimal(used),
        deducted_days: this.leaveBalanceService.toDecimal(deducted),
        settlement_days: this.leaveBalanceService.toDecimal(settlement),
        status: 'pending_payroll',
        details: {
          accrual_method: accrual?.accrual_method ?? 'yearly',
          annual_entitlement_days: entitlement,
          leave_actions: leaveActions,
        },
        created_by_company_user_id: actor.companyMembershipId ?? null,
      });
      rows.push(await repository.save(row));
    }

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: null,
      action: 'leave_exit_settlement.calculated',
      entity_name: 'employee',
      entity_id: employeeId,
      actor,
      payload: {
        exit_date: exitDate,
        offboarding_request_id: offboardingRequestId,
        leave_actions: leaveActions,
        settlements: rows.map((row) => ({
          leave_type_id: row.leave_type_id,
          settlement_days: Number(row.settlement_days),
        })),
      },
    });

    return {
      employee_id: employeeId,
      exit_date: exitDate,
      leave_actions: leaveActions,
      settlements: rows.map((row) => this.map(row)),
    };
  }

  list(companyId: number, employeeId?: number) {
    return this.dataSource
      .getRepository(LeaveExitSettlement)
      .find({
        where: {
          company_id: companyId,
          ...(employeeId ? { employee_id: employeeId } : {}),
        },
        order: { created_at: 'DESC' },
        take: 500,
      })
      .then((rows) => rows.map((row) => this.map(row)));
  }

  /** Cancels leave after the exit date and cuts leave spanning it. */
  private async closeFutureLeave(
    companyId: number,
    employeeId: number,
    exitDate: string,
    actor: AuthenticatedUser,
  ) {
    const requests = await this.dataSource.getRepository(LeaveRequest).find({
      where: {
        company_id: companyId,
        employee_id: employeeId,
        status: In(OPEN_STATUSES),
      },
      order: { start_date: 'ASC' },
    });
    const actions: Array<Record<string, unknown>> = [];
    for (const request of requests) {
      const start = String(request.start_date).slice(0, 10);
      const end = String(request.end_date).slice(0, 10);
      if (end <= exitDate) continue;
      try {
        if (request.status === LeaveStatusEnum.APPROVED && start <= exitDate) {
          await this.leaveService.endLeaveEarly(
            companyId,
            request.id,
            { new_end_date: exitDate, reason: 'Employee exit' },
            actor,
          );
          actions.push({
            leave_request_id: request.id,
            action: 'ended_at_exit',
          });
        } else {
          await this.leaveService.cancelLeaveRequest(
            companyId,
            request.id,
            { reason: 'Cancelled at employee exit' },
            actor,
          );
          actions.push({ leave_request_id: request.id, action: 'cancelled' });
        }
      } catch (error) {
        actions.push({
          leave_request_id: request.id,
          action: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return actions;
  }

  /** Acts as HR for settlement; attributed to whoever completed offboarding. */
  private systemActor(
    companyId: number,
    companyMembershipId: number | null,
  ): AuthenticatedUser {
    return {
      id: 0,
      email: 'system',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId,
      companyMembershipId: companyMembershipId ?? undefined,
      roles: [],
      permissions: [
        'data_scope:company',
        'leave_requests:approve',
        'leave_requests:cancel',
      ],
    };
  }

  private map(row: LeaveExitSettlement) {
    return {
      id: row.id,
      employee_id: row.employee_id,
      leave_type_id: row.leave_type_id,
      offboarding_request_id: row.offboarding_request_id,
      exit_date: row.exit_date,
      earned_to_exit_days: Number(row.earned_to_exit_days),
      carried_forward_days: Number(row.carried_forward_days),
      adjusted_days: Number(row.adjusted_days),
      used_days: Number(row.used_days),
      deducted_days: Number(row.deducted_days),
      settlement_days: Number(row.settlement_days),
      settlement_type:
        Number(row.settlement_days) > 0
          ? 'pay_out'
          : Number(row.settlement_days) < 0
            ? 'recover'
            : 'none',
      status: row.status,
      details: row.details,
      created_at: row.created_at,
    };
  }
}
