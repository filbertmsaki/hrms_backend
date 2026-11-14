import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource, In } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { OffboardingCompletedEvent } from '../../notifications/events';
import { OffboardingRequest } from '../../offboarding/entities/offboarding-request.entity';
import { OffboardingSettlementItem } from '../../offboarding/entities/offboarding-settlement-item.entity';
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
import { MainlandLeaveService } from './mainland-leave.service';
import { LeaveType } from '../entities/leave-type.entity';

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
    @Optional() private readonly mainland?: MainlandLeaveService,
  ) {}

  /** Mainland employees settle annual leave only (other types are not paid out). */
  private async settleMainland(
    companyId: number,
    employeeId: number,
    exitDate: string,
    actor: AuthenticatedUser,
    offboardingRequestId: number | null,
    leaveActions: unknown,
  ) {
    if (!this.mainland) return null;
    const result = await this.mainland.terminationSettlement(this.dataSource.manager, companyId, employeeId, exitDate);
    if (!result) return null;
    const codes = (result.policy as unknown as { leave_type_codes: Record<string, string> }).leave_type_codes;
    const annualType = await this.dataSource.getRepository(LeaveType).findOne({ where: { company_id: companyId, code: codes.annual } });
    if (!annualType) throw new NotFoundException('Mainland annual leave type not found');
    const repository = this.dataSource.getRepository(LeaveExitSettlement);
    const existing = await repository.findOne({ where: { company_id: companyId, employee_id: employeeId, leave_type_id: annualType.id, exit_date: exitDate } });
    if (existing && !['pending_payroll', 'recovery_draft', 'needs_wage'].includes(existing.status))
      return { employee_id: employeeId, exit_date: exitDate, leave_actions: leaveActions, settlements: [this.map(existing)] };
    const recovery = result.settlement?.recoveryDraft ?? null;
    const status = !result.settlement ? 'needs_wage' : recovery ? 'recovery_draft' : 'pending_payroll';
    const row = existing ?? repository.create();
    Object.assign(row, {
      company_id: companyId,
      employee_id: employeeId,
      leave_type_id: annualType.id,
      offboarding_request_id: offboardingRequestId,
      exit_date: exitDate,
      earned_to_exit_days: result.days.toFixed(2),
      carried_forward_days: '0.00',
      adjusted_days: '0.00',
      used_days: '0.00',
      deducted_days: '0.00',
      settlement_days: (result.settlement ? result.settlement.payoutDays : 0).toFixed(2),
      status,
      details: {
        mainland: true,
        policy_revision_id: result.revisionId,
        balance_days_4dp: result.days,
        buckets: result.buckets,
        wage: result.wage,
        divisor: result.policy.termination.monthly_wage_divisor,
        payout_amount: result.settlement?.payoutAmount ?? null,
        recovery_draft: recovery
          ? { ...recovery, finance_approval_required: true, legal_confirmation_required: true, direct_deduction: false }
          : null,
        leave_actions: leaveActions,
      },
      created_by_company_user_id: actor.companyMembershipId ?? null,
    });
    const saved = await repository.save(row);
    await this.leaveAuditService.log({ company_id: companyId, leave_request_id: null, action: 'leave_exit_settlement.mainland_calculated', entity_name: 'employee', entity_id: employeeId, actor, payload: { exit_date: exitDate, status, details: saved.details } });
    return { employee_id: employeeId, exit_date: exitDate, leave_actions: leaveActions, settlements: [this.map(saved)] };
  }

  /**
   * Payroll paid a final settlement: post the Mainland PAYOUT for each Mainland
   * leave encashment item. Idempotent per item, so a replayed event is harmless.
   */
  @OnEvent('payroll.final_settlement.paid')
  async onFinalSettlementPaid(event: { companyId: number; settlementId: number; itemIds: number[] }) {
    if (!this.mainland || !event.itemIds?.length) return [];
    const items = await this.dataSource.getRepository(OffboardingSettlementItem).find({ where: { company_id: event.companyId, id: In(event.itemIds) } });
    const posted: number[] = [];
    for (const item of items) {
      const snap = item.calculation_snapshot as { mainland?: boolean; employee_id: number; leave_type_id: number; exit_date: string; payout_days: number; policy_revision_id: number } | null;
      if (!snap?.leave_type_id) continue;
      if (!snap.mainland) {
        // Legacy encashment: the day record follows the paid item.
        await this.dataSource.getRepository(LeaveExitSettlement).update(
          { company_id: event.companyId, offboarding_request_id: item.offboarding_request_id, leave_type_id: snap.leave_type_id, status: 'final_settlement' },
          { status: 'paid' },
        );
        continue;
      }
      try {
        await this.dataSource.transaction(async (m) => {
          await this.mainland!.recordPayout(m, event.companyId, snap.employee_id, snap.leave_type_id, snap.exit_date, Number(snap.payout_days), `final-settlement:${event.settlementId}:item:${item.id}`, snap.policy_revision_id);
          await m.getRepository(LeaveExitSettlement).update(
            { company_id: event.companyId, employee_id: snap.employee_id, leave_type_id: snap.leave_type_id, exit_date: snap.exit_date, status: 'pending_payroll' },
            { status: 'paid' },
          );
        });
        posted.push(item.id);
      } catch (error) {
        this.logger.error(`Mainland payout posting failed for settlement ${event.settlementId} item ${item.id}: ${(error as Error).message}`);
      }
    }
    return posted;
  }

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

    const mainlandResult = await this.settleMainland(
      companyId,
      employeeId,
      exitDate,
      actor,
      offboardingRequestId,
      leaveActions,
    );
    if (mainlandResult) return mainlandResult;

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
      if (existing && !['pending_payroll', 'final_settlement'].includes(existing.status)) {
        rows.push(existing);
        continue;
      }
      // Offboarding already turned this balance into a leave encashment item in
      // the final settlement; that item is what pays. This row is then a record
      // of the days, never a second payroll instruction.
      const encashmentItem = offboardingRequestId
        ? await this.dataSource
            .getRepository(OffboardingSettlementItem)
            .createQueryBuilder('item')
            .where('item.company_id = :companyId', { companyId })
            .andWhere('item.offboarding_request_id = :offboardingRequestId', { offboardingRequestId })
            .andWhere("item.item_type = 'leave_encashment'")
            .andWhere("(item.calculation_snapshot ->> 'leave_type_id')::int = :leaveTypeId", { leaveTypeId: balance.leave_type_id })
            .getOne()
        : null;
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
        status: encashmentItem ? 'final_settlement' : 'pending_payroll',
        details: {
          accrual_method: accrual?.accrual_method ?? 'yearly',
          annual_entitlement_days: entitlement,
          leave_actions: leaveActions,
          offboarding_settlement_item_id: encashmentItem?.id ?? null,
          offboarding_settlement_amount: encashmentItem?.amount ?? null,
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
