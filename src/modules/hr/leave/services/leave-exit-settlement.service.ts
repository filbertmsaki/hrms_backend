import { openingOrCarriedDays } from '../utils/leave-balance-rules.util';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { emitLeaveLifecycle } from '../utils/leave-lifecycle-notify.util';
import { DataSource, In } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import {
  OffboardingApprovedEvent,
  OffboardingCompletedEvent,
  OffboardingRejectedEvent,
} from '../../notifications/events';

/** Settlement rows that may still be recalculated. */
const RECALCULABLE = [
  'draft',
  'approved',
  'pending_payroll',
  'final_settlement',
  'void',
];
/** Rows a cancelled/rejected offboarding voids (never paid ones). */
const VOIDABLE = ['draft', 'approved', 'pending_payroll'];
type SettleMode = 'preview' | 'completion' | 'manual';
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
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  /**
   * Offboarding approved with an exit date: prepare a DRAFT settlement for
   * HR approval. Read-only for leave (no request is cancelled or cut yet);
   * nothing goes to payroll from a draft.
   */
  @OnEvent(OffboardingApprovedEvent.EVENT)
  async onOffboardingApproved(event: OffboardingApprovedEvent) {
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
        'preview',
      );
    } catch (error) {
      this.logger.error(
        `Leave exit settlement preview failed for offboarding ${event.offboardingRequestId}`,
        error instanceof Error ? error.stack : String(error),
      );
      emitLeaveLifecycle(this.eventEmitter, {
        companyId: event.companyId,
        eventKey: 'leave.exit_settlement.failed',
        title: 'Exit leave settlement could not be prepared',
        message: `The leave settlement for offboarding #${event.offboardingRequestId} could not be calculated: ${error instanceof Error ? error.message : String(error)}`,
        notifyHr: true,
        entityType: 'OFFBOARDING_REQUEST',
        entityId: event.offboardingRequestId,
        actionUrl: '/dashboard/leave-management',
        dedupeKey: `exit-settlement:${event.offboardingRequestId}:preview-failed`,
        priority: 'high',
      });
    }
  }

  @OnEvent(OffboardingRejectedEvent.EVENT)
  async onOffboardingRejected(event: OffboardingRejectedEvent) {
    await this.voidForOffboarding(
      event.companyId,
      event.offboardingRequestId,
      'Offboarding rejected',
    );
  }

  @OnEvent('hr.offboarding.cancelled')
  async onOffboardingCancelled(event: {
    companyId: number;
    offboardingRequestId: number;
  }) {
    await this.voidForOffboarding(
      event.companyId,
      event.offboardingRequestId,
      'Offboarding cancelled',
    );
  }

  /** Voids unpaid settlement rows of an offboarding that will not happen. */
  async voidForOffboarding(
    companyId: number,
    offboardingRequestId: number,
    reason: string,
  ) {
    const repo = this.dataSource.getRepository(LeaveExitSettlement);
    const rows = await repo.find({
      where: {
        company_id: companyId,
        offboarding_request_id: offboardingRequestId,
        status: In(VOIDABLE),
      },
    });
    for (const row of rows) {
      row.details = {
        ...(row.details ?? {}),
        voided_at: new Date().toISOString(),
        void_reason: reason,
        status_before_void: row.status,
      };
      row.status = 'void';
      await repo.save(row);
    }
    if (rows.length)
      await this.leaveAuditService.log({
        company_id: companyId,
        leave_request_id: null,
        action: 'leave_exit_settlement.voided',
        entity_name: 'offboarding_request',
        entity_id: offboardingRequestId,
        payload: { reason, settlement_ids: rows.map((r) => r.id) },
      });
    return { voided: rows.length };
  }

  /**
   * HR approves the exit leave settlement. If offboarding has already
   * completed, the settlement is finalised immediately (recalculated, future
   * leave closed, handed to the final settlement); otherwise it is finalised
   * when offboarding completes. Approval never marks anything paid.
   */
  async approve(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const repo = this.dataSource.getRepository(LeaveExitSettlement);
    const rows = await repo.find({
      where: {
        company_id: companyId,
        offboarding_request_id: offboardingRequestId,
        status: 'draft',
      },
    });
    if (!rows.length)
      throw new BadRequestException(
        'There is no draft exit leave settlement for this offboarding.',
      );
    for (const row of rows) {
      row.status = 'approved';
      row.details = {
        ...(row.details ?? {}),
        approved_at: new Date().toISOString(),
        approved_by_company_user_id: actor.companyMembershipId ?? null,
      };
      await repo.save(row);
    }
    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: null,
      action: 'leave_exit_settlement.approved',
      entity_name: 'offboarding_request',
      entity_id: offboardingRequestId,
      actor,
      payload: { settlement_ids: rows.map((r) => r.id) },
    });
    emitLeaveLifecycle(this.eventEmitter, {
      companyId,
      eventKey: 'leave.exit_settlement.approved',
      title: 'Exit leave settlement approved',
      message: `The leave settlement for offboarding #${offboardingRequestId} was approved.`,
      employeeId: rows[0].employee_id,
      notifyHr: true,
      senderCompanyUserId: actor.companyMembershipId ?? null,
      entityType: 'OFFBOARDING_REQUEST',
      entityId: offboardingRequestId,
      actionUrl: '/dashboard/leave-management',
      dedupeKey: `exit-settlement:${offboardingRequestId}:approved`,
    });
    const offboarding = await this.dataSource
      .getRepository(OffboardingRequest)
      .findOne({
        where: { id: offboardingRequestId, company_id: companyId },
        select: ['id', 'employee_id', 'status', 'last_working_date'],
      });
    if (offboarding && String(offboarding.status) === 'completed') {
      return this.settle(
        companyId,
        rows[0].employee_id,
        String(rows[0].exit_date).slice(0, 10),
        actor,
        offboardingRequestId,
        'completion',
      );
    }
    return {
      approved: rows.length,
      settlements: rows.map((r) => this.map(r)),
    };
  }

  /**
   * Payroll paid a final settlement: mark the matching leave encashment day
   * records as paid. Idempotent, so a replayed event is harmless.
   */
  @OnEvent('payroll.final_settlement.paid')
  async onFinalSettlementPaid(event: {
    companyId: number;
    settlementId: number;
    itemIds: number[];
  }) {
    if (!event.itemIds?.length) return [];
    const items = await this.dataSource
      .getRepository(OffboardingSettlementItem)
      .find({ where: { company_id: event.companyId, id: In(event.itemIds) } });
    const posted: number[] = [];
    for (const item of items) {
      const snap = item.calculation_snapshot as {
        leave_type_id?: number;
      } | null;
      if (!snap?.leave_type_id) continue;
      // The day record follows the paid encashment item.
      const result = await this.dataSource
        .getRepository(LeaveExitSettlement)
        .update(
          {
            company_id: event.companyId,
            offboarding_request_id: item.offboarding_request_id,
            leave_type_id: snap.leave_type_id,
            status: 'final_settlement',
          },
          { status: 'paid' },
        );
      posted.push(item.id);
      if (result.affected)
        emitLeaveLifecycle(this.eventEmitter, {
          companyId: event.companyId,
          eventKey: 'leave.exit_settlement.completed',
          title: 'Exit leave settlement paid',
          message: `The leave part of the final settlement for offboarding #${item.offboarding_request_id} was paid by payroll.`,
          notifyHr: true,
          entityType: 'OFFBOARDING_REQUEST',
          entityId: item.offboarding_request_id,
          actionUrl: '/dashboard/leave-management',
          dedupeKey: `exit-settlement:${item.offboarding_request_id}:paid:${snap.leave_type_id}`,
        });
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
        'completion',
      );
    } catch (error) {
      // Offboarding is already complete; HR can re-run settlement manually.
      emitLeaveLifecycle(this.eventEmitter, {
        companyId: event.companyId,
        eventKey: 'leave.exit_settlement.failed',
        title: 'Exit leave settlement failed',
        message: `The leave settlement for offboarding #${event.offboardingRequestId} failed at completion: ${error instanceof Error ? error.message : String(error)}. Re-run it from Leave Operations.`,
        notifyHr: true,
        entityType: 'OFFBOARDING_REQUEST',
        entityId: event.offboardingRequestId,
        actionUrl: '/dashboard/leave-management',
        dedupeKey: `exit-settlement:${event.offboardingRequestId}:completion-failed`,
        priority: 'high',
      });
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
    mode: SettleMode = 'manual',
  ) {
    const employee = await this.dataSource.getRepository(Employee).findOne({
      where: { id: employeeId, company_id: companyId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    // A preview never changes leave; it lists what completion will do.
    const leaveActions =
      mode === 'preview'
        ? await this.plannedLeaveActions(companyId, employeeId, exitDate)
        : await this.closeFutureLeave(companyId, employeeId, exitDate, actor);

    // Settle each leave type in the leave cycle that contains the exit date
    // (calendar, anniversary or custom year).
    const calendarBalances =
      await this.leaveBalanceService.ensureBalancesForEmployeeYear(
        companyId,
        employee,
        exitDate.slice(0, 4),
        undefined,
        undefined,
        true,
      );
    const balances: typeof calendarBalances = [];
    for (const balance of calendarBalances) {
      const cycleAssignment =
        await this.leaveBalanceService.resolvePolicyAssignment(
          companyId,
          employee,
          balance.leave_type_id,
        );
      const label = this.leaveBalanceService.cycleForDate(
        this.leaveBalanceService.effectiveAccrual(cycleAssignment),
        exitDate,
        employee,
      ).label;
      if (label === balance.fiscal_year) {
        balances.push(balance);
        continue;
      }
      const [cycleBalance] =
        await this.leaveBalanceService.ensureBalancesForEmployeeYear(
          companyId,
          employee,
          label,
          undefined,
          balance.leave_type_id,
          true,
        );
      if (cycleBalance) balances.push(cycleBalance);
    }
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

      const year = balance.fiscal_year;
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
      const carried = openingOrCarriedDays(balance);
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
      if (existing && !RECALCULABLE.includes(existing.status)) {
        rows.push(existing);
        continue;
      }
      // HR approval gates payroll: completion without approval keeps a
      // recalculated draft and asks HR to approve it. A manual HR run is
      // itself the approval.
      const approved =
        mode === 'manual' ||
        existing?.status === 'approved' ||
        existing?.status === 'pending_payroll' ||
        existing?.status === 'final_settlement';
      // Offboarding already turned this balance into a leave encashment item in
      // the final settlement; that item is what pays. This row is then a record
      // of the days, never a second payroll instruction.
      const encashmentItem = offboardingRequestId
        ? await this.dataSource
            .getRepository(OffboardingSettlementItem)
            .createQueryBuilder('item')
            .where('item.company_id = :companyId', { companyId })
            .andWhere('item.offboarding_request_id = :offboardingRequestId', {
              offboardingRequestId,
            })
            .andWhere("item.item_type = 'leave_encashment'")
            .andWhere(
              "(item.calculation_snapshot ->> 'leave_type_id')::int = :leaveTypeId",
              { leaveTypeId: balance.leave_type_id },
            )
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
        status:
          mode === 'preview' || !approved
            ? existing?.status === 'approved'
              ? 'approved'
              : 'draft'
            : encashmentItem
              ? 'final_settlement'
              : 'pending_payroll',
        details: {
          ...(existing?.details ?? {}),
          settle_mode: mode,
          ...(mode === 'manual'
            ? {
                approved_at:
                  (existing?.details?.approved_at as string | undefined) ??
                  new Date().toISOString(),
                approved_by_company_user_id:
                  (existing?.details?.approved_by_company_user_id as
                    | number
                    | undefined) ??
                  actor.companyMembershipId ??
                  null,
              }
            : {}),
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

    this.notifySettled(companyId, employeeId, offboardingRequestId, mode, rows);

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: null,
      action:
        mode === 'preview'
          ? 'leave_exit_settlement.draft_prepared'
          : 'leave_exit_settlement.calculated',
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

  private notifySettled(
    companyId: number,
    employeeId: number,
    offboardingRequestId: number | null,
    mode: SettleMode,
    rows: LeaveExitSettlement[],
  ) {
    const key = offboardingRequestId ?? `employee-${employeeId}`;
    const days = roundLeaveDays(
      rows.reduce((s, r) => s + Number(r.settlement_days), 0),
    );
    const base = {
      companyId,
      employeeId,
      notifyHr: true,
      entityType: offboardingRequestId ? 'OFFBOARDING_REQUEST' : 'EMPLOYEE',
      entityId: offboardingRequestId ?? employeeId,
      actionUrl: '/dashboard/leave-management',
    };
    if (rows.some((r) => r.status === 'draft')) {
      emitLeaveLifecycle(this.eventEmitter, {
        ...base,
        eventKey: 'leave.exit_settlement.initiated',
        title: 'Exit leave settlement awaiting approval',
        message: `A leave settlement of ${days} day(s) was prepared for the employee's exit and needs HR approval.`,
        dedupeKey: `exit-settlement:${key}:draft:${mode}`,
      });
    }
    if (
      rows.some((r) =>
        ['final_settlement', 'pending_payroll'].includes(r.status),
      )
    ) {
      emitLeaveLifecycle(this.eventEmitter, {
        ...base,
        eventKey: 'leave.exit_settlement.submitted_to_payroll',
        title: 'Exit leave settlement sent to payroll',
        message: `The approved exit leave settlement (${days} day(s)) is ready for the final payroll settlement.`,
        dedupeKey: `exit-settlement:${key}:payroll`,
      });
    }
  }

  /** What completion would do to open leave (preview only, no changes). */
  private async plannedLeaveActions(
    companyId: number,
    employeeId: number,
    exitDate: string,
  ) {
    const requests = await this.dataSource.getRepository(LeaveRequest).find({
      where: {
        company_id: companyId,
        employee_id: employeeId,
        status: In(OPEN_STATUSES),
      },
      order: { start_date: 'ASC' },
    });
    return requests
      .filter((r) => String(r.end_date).slice(0, 10) > exitDate)
      .map((r) => ({
        leave_request_id: r.id,
        action:
          r.status === LeaveStatusEnum.APPROVED &&
          String(r.start_date).slice(0, 10) <= exitDate
            ? 'will_end_at_exit'
            : 'will_cancel',
        planned: true,
      }));
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
