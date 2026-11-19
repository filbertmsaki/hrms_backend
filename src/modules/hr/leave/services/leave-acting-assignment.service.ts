import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import { hasPermission } from '../../../../common/utils/permission.util';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  LeaveActingAssignment,
  LeaveActingAssignmentStatus as S,
} from '../entities/leave-acting-assignment.entity';
import { LeaveApprovalDelegation } from '../entities/leave-approval-delegation.entity';
import { LeaveRequestApproval } from '../entities/leave-request-approval.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import { emitLeaveLifecycle } from '../utils/leave-lifecycle-notify.util';
import { LeaveAuditService } from './leave-audit.service';

export type ActingAssignmentInput = {
  acting_employee_id: number;
  start_date?: string | null;
  end_date?: string | null;
  responsibilities?: string | null;
  route_approvals?: boolean;
};

const PENDING_LEAVE: LeaveStatusEnum[] = [
  LeaveStatusEnum.DRAFT,
  LeaveStatusEnum.SUBMITTED,
  LeaveStatusEnum.IN_REVIEW,
  LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
  LeaveStatusEnum.PENDING_HR,
  LeaveStatusEnum.RETURNED_FOR_CORRECTION,
];
/** Leave that blocks an employee from acting for someone else. */
const BLOCKING_LEAVE: LeaveStatusEnum[] = [
  LeaveStatusEnum.SUBMITTED,
  LeaveStatusEnum.IN_REVIEW,
  LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
  LeaveStatusEnum.PENDING_HR,
  LeaveStatusEnum.APPROVED,
];
const OPEN: S[] = [S.PENDING, S.ACTIVE];
const HR_PERMISSIONS = ['leave_requests:override', 'data_scope:company'];

type SyncPlan = {
  status: S;
  start_date: string;
  end_date: string;
  reason?: string;
};

/**
 * Lifecycle rules (pure, idempotent). Given the assignment and its leave as
 * they are now, returns the state the assignment should have, or null when
 * nothing changes. Terminal states (completed / cancelled) never reopen.
 */
export function planActingSync(
  a: Pick<
    LeaveActingAssignment,
    'status' | 'start_date' | 'end_date' | 'follows_leave_dates'
  >,
  leave: Pick<LeaveRequest, 'status' | 'start_date' | 'end_date'>,
  today: string,
): SyncPlan | null {
  if (a.status === S.CANCELLED || a.status === S.COMPLETED) return null;
  const leaveStart = String(leave.start_date).slice(0, 10);
  const leaveEnd = String(leave.end_date).slice(0, 10);
  if (
    leave.status === LeaveStatusEnum.CANCELLED ||
    leave.status === LeaveStatusEnum.REJECTED
  ) {
    return {
      status: S.CANCELLED,
      start_date: a.start_date,
      end_date: a.end_date,
      reason: `Leave ${leave.status}`,
    };
  }
  // Dates: default assignments mirror the leave (extension, edits, early
  // return); custom ones are clamped into the leave window.
  let start = a.follows_leave_dates ? leaveStart : a.start_date;
  let end = a.follows_leave_dates ? leaveEnd : a.end_date;
  if (start < leaveStart || start > leaveEnd) start = leaveStart;
  if (end > leaveEnd || end < start) end = leaveEnd;

  let status: S;
  if (PENDING_LEAVE.includes(leave.status)) status = S.PENDING;
  else if (today > end) status = S.COMPLETED;
  else if (today >= start) status = S.ACTIVE;
  else status = S.PENDING;

  if (status === a.status && start === a.start_date && end === a.end_date)
    return null;
  return { status, start_date: start, end_date: end };
}

/** Calendar date (YYYY-MM-DD) in the given timezone. */
export function dateInZone(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Acting employee (leave delegation) for an employee on leave: who covers,
 * for which dates and responsibilities. One open assignment per leave
 * request; every change is audited and the people concerned are notified.
 */
@Injectable()
export class LeaveActingAssignmentService {
  private readonly logger = new Logger(LeaveActingAssignmentService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly leaveAuditService: LeaveAuditService,
    private readonly hrAccessService: HrAccessService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  today(now = new Date()): string {
    return dateInZone(
      now,
      this.configService.get<string>('APP_TIMEZONE') ?? 'Africa/Dar_es_Salaam',
    );
  }

  private isHr(actor: AuthenticatedUser): boolean {
    return HR_PERMISSIONS.some((p) => hasPermission(actor.permissions, p));
  }

  /** Approvers on the request's current cycle, or HR, may appoint. */
  private async assertCanManage(
    leave: LeaveRequest,
    actor: AuthenticatedUser,
    manager: EntityManager,
  ): Promise<void> {
    if (actor.companyId !== leave.company_id)
      throw new ForbiddenException('Leave request is in another company.');
    if (this.isHr(actor)) {
      await this.hrAccessService.assertCanAccessEmployee(actor, leave.employee);
      return;
    }
    if (actor.employeeId && actor.employeeId === leave.employee_id)
      throw new ForbiddenException(
        'The acting employee is appointed by your approver, not by you.',
      );
    const isApprover = await manager.getRepository(LeaveRequestApproval).exist({
      where: {
        leave_request_id: leave.id,
        approver_company_user_id: actor.companyMembershipId ?? -1,
      },
    });
    if (!isApprover)
      throw new ForbiddenException(
        'Only an approver of this leave request or HR can appoint an acting employee.',
      );
  }

  private async loadLeave(
    companyId: number,
    leaveRequestId: number,
    manager: EntityManager,
    lock = false,
  ): Promise<LeaveRequest> {
    if (lock)
      await manager.getRepository(LeaveRequest).findOne({
        where: { id: leaveRequestId, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
    const leave = await manager.getRepository(LeaveRequest).findOne({
      where: { id: leaveRequestId, company_id: companyId },
      relations: {
        employee: { primary_department: true, primary_position: true },
        leave_type: true,
      },
    });
    if (!leave) throw new NotFoundException('Leave request not found');
    return leave;
  }

  /**
   * Checks an acting employee for a leave window. Errors block; warnings
   * (other concurrent acting duties) are returned for the UI to show.
   */
  async validateCandidate(
    companyId: number,
    leave: Pick<LeaveRequest, 'id' | 'employee_id'>,
    actingEmployeeId: number,
    start: string,
    end: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<{ employee: Employee; warnings: string[] }> {
    if (actingEmployeeId === leave.employee_id)
      throw new BadRequestException(
        'An employee cannot act for themselves. Choose a colleague.',
      );
    const employee = await manager.getRepository(Employee).findOne({
      where: { id: actingEmployeeId, company_id: companyId },
      relations: { primary_department: true, primary_position: true },
    });
    if (!employee)
      throw new BadRequestException(
        'Acting employee not found in this company.',
      );
    if (employee.employment_status !== EmploymentStatusEnum.ACTIVE)
      throw new BadRequestException(
        `${this.name(employee)} is not an active employee (${employee.employment_status}).`,
      );
    const leaveClash = await manager
      .getRepository(LeaveRequest)
      .createQueryBuilder('lr')
      .where('lr.company_id = :companyId', { companyId })
      .andWhere('lr.employee_id = :id', { id: actingEmployeeId })
      .andWhere('lr.status IN (:...statuses)', { statuses: BLOCKING_LEAVE })
      .andWhere('lr.start_date <= :end AND lr.end_date >= :start', {
        start,
        end,
      })
      .orderBy('lr.start_date', 'ASC')
      .getOne();
    if (leaveClash)
      throw new BadRequestException(
        `${this.name(employee)} has ${leaveClash.status === LeaveStatusEnum.APPROVED ? 'approved' : 'pending'} leave ${String(leaveClash.start_date).slice(0, 10)} – ${String(leaveClash.end_date).slice(0, 10)} overlapping this period.`,
      );
    const others = await manager
      .getRepository(LeaveActingAssignment)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.absent_employee', 'absent')
      .where('a.company_id = :companyId', { companyId })
      .andWhere('a.acting_employee_id = :id', { id: actingEmployeeId })
      .andWhere('a.status IN (:...open)', { open: OPEN })
      .andWhere('a.leave_request_id <> :leaveId', { leaveId: leave.id })
      .andWhere('a.start_date <= :end AND a.end_date >= :start', { start, end })
      .getMany();
    return {
      employee,
      warnings: others.map(
        (o) =>
          `Also acting for ${this.name(o.absent_employee)} (${o.start_date} – ${o.end_date}).`,
      ),
    };
  }

  /**
   * Appoints (or replaces) the acting employee for a leave request. Runs in
   * the caller's transaction when one is given, so an approval and its
   * acting assignment commit together.
   */
  async assign(
    companyId: number,
    leaveRequestId: number,
    input: ActingAssignmentInput,
    actor: AuthenticatedUser,
    outer?: EntityManager,
  ) {
    const run = async (manager: EntityManager) => {
      const leave = await this.loadLeave(
        companyId,
        leaveRequestId,
        manager,
        true,
      );
      await this.assertCanManage(leave, actor, manager);
      if (
        leave.status === LeaveStatusEnum.CANCELLED ||
        leave.status === LeaveStatusEnum.REJECTED
      )
        throw new BadRequestException(
          `Cannot appoint an acting employee on ${leave.status} leave.`,
        );
      const leaveStart = String(leave.start_date).slice(0, 10);
      const leaveEnd = String(leave.end_date).slice(0, 10);
      const start = (input.start_date || leaveStart).slice(0, 10);
      const end = (input.end_date || leaveEnd).slice(0, 10);
      if (end < start)
        throw new BadRequestException(
          'Delegation end date is before its start date.',
        );
      if (start < leaveStart || end > leaveEnd)
        throw new BadRequestException(
          `Delegation dates must fall within the leave (${leaveStart} – ${leaveEnd}).`,
        );
      const responsibilities = input.responsibilities?.trim() || null;
      if (responsibilities && responsibilities.length > 2000)
        throw new BadRequestException(
          'Responsibilities are limited to 2000 characters.',
        );

      const repo = manager.getRepository(LeaveActingAssignment);
      const current = await repo.findOne({
        where: { leave_request_id: leave.id, status: Not(S.CANCELLED) },
      });
      if (current?.status === S.COMPLETED)
        throw new ConflictException('This delegation has already completed.');
      if (current?.status === S.ACTIVE && !this.isHr(actor))
        throw new ForbiddenException(
          'The delegation is already active; only HR can change it now.',
        );

      const { employee: acting, warnings } = await this.validateCandidate(
        companyId,
        leave,
        input.acting_employee_id,
        start,
        end,
        manager,
      );
      const routeApprovals = !!input.route_approvals;
      const sameAsCurrent =
        current &&
        current.acting_employee_id === acting.id &&
        current.start_date === start &&
        current.end_date === end &&
        (current.responsibilities ?? null) === responsibilities &&
        current.route_approvals === routeApprovals;
      if (sameAsCurrent)
        return { assignment: current, warnings, changed: false };

      const appointer = actor.employeeId
        ? await manager.getRepository(Employee).findOne({
            where: { id: actor.employeeId, company_id: companyId },
          })
        : null;
      const followsLeave = start === leaveStart && end === leaveEnd;
      let saved: LeaveActingAssignment;
      let action: string;
      if (current && current.acting_employee_id === acting.id) {
        // Same person, new terms: update in place.
        Object.assign(current, {
          start_date: start,
          end_date: end,
          follows_leave_dates: followsLeave,
          responsibilities,
          route_approvals: routeApprovals,
        });
        saved = await repo.save(current);
        action = 'leave_acting.updated';
      } else {
        if (current) {
          current.status = S.CANCELLED;
          current.cancelled_at = new Date();
          current.cancelled_by_company_user_id =
            actor.companyMembershipId ?? null;
          current.cancellation_reason = 'Replaced by another acting employee';
          await repo.save(current);
          await this.endApprovalRouting(current, manager);
        }
        saved = await repo.save(
          repo.create({
            company_id: companyId,
            leave_request_id: leave.id,
            absent_employee_id: leave.employee_id,
            acting_employee_id: acting.id,
            appointed_by_employee_id: appointer?.id ?? null,
            appointed_by_company_user_id: actor.companyMembershipId ?? null,
            start_date: start,
            end_date: end,
            follows_leave_dates: followsLeave,
            responsibilities,
            route_approvals: routeApprovals,
            status: S.PENDING,
          }),
        );
        if (current) {
          current.replaced_by_assignment_id = saved.id;
          await repo.save(current);
        }
        action = current ? 'leave_acting.replaced' : 'leave_acting.assigned';
      }
      await this.syncApprovalRouting(saved, leave, actor, manager);
      await this.leaveAuditService.log(
        {
          company_id: companyId,
          leave_request_id: leave.id,
          action,
          entity_name: 'leave_acting_assignment',
          entity_id: saved.id,
          actor,
          payload: {
            acting_employee_id: acting.id,
            previous_acting_employee_id: current?.acting_employee_id ?? null,
            start_date: start,
            end_date: end,
            responsibilities,
            route_approvals: routeApprovals,
            warnings,
          },
        },
        manager,
      );
      // Leave may already be approved / under way.
      await this.syncAssignment(saved, leave, manager);
      return {
        assignment: saved,
        warnings,
        changed: true,
        notify: {
          leave,
          acting,
          previousActingEmployeeId:
            current && current.acting_employee_id !== acting.id
              ? current.acting_employee_id
              : null,
        },
      };
    };
    const result = outer
      ? await run(outer)
      : await this.dataSource.transaction(run);
    if (!outer) this.notifyAssigned(result, actor);
    return result;
  }

  /** Call after the outer transaction commits (approval flow). */
  notifyAssigned(
    result: Awaited<ReturnType<LeaveActingAssignmentService['assign']>>,
    actor: AuthenticatedUser,
  ): void {
    if (!result.changed || !('notify' in result) || !result.notify) return;
    const { leave, acting, previousActingEmployeeId } = result.notify;
    const a = result.assignment;
    const absent = this.name(leave.employee);
    emitLeaveLifecycle(this.eventEmitter, {
      companyId: a.company_id,
      eventKey: 'leave.acting.assigned',
      title: 'You have been appointed acting employee',
      message: `You will act for ${absent} from ${a.start_date} to ${a.end_date}${a.responsibilities ? `. Responsibilities: ${a.responsibilities.slice(0, 300)}` : ''}.`,
      employeeId: acting.id,
      senderCompanyUserId: actor.companyMembershipId ?? null,
      entityType: 'LEAVE_ACTING_ASSIGNMENT',
      entityId: a.id,
      actionUrl: `/dashboard/employees/profile/${encodeURIComponent(leave.employee.employee_no)}`,
      dedupeKey: `leave-acting:${a.id}:assigned:${a.acting_employee_id}:${a.start_date}:${a.end_date}`,
    });
    emitLeaveLifecycle(this.eventEmitter, {
      companyId: a.company_id,
      eventKey: 'leave.acting.assigned',
      title: 'Acting employee appointed for your leave',
      message: `${this.name(acting)} will act for you from ${a.start_date} to ${a.end_date}.`,
      employeeId: leave.employee_id,
      senderCompanyUserId: actor.companyMembershipId ?? null,
      entityType: 'LEAVE_ACTING_ASSIGNMENT',
      entityId: a.id,
      actionUrl: '/dashboard/me/leave',
      dedupeKey: `leave-acting:${a.id}:absent-informed:${a.acting_employee_id}:${a.start_date}:${a.end_date}`,
    });
    if (previousActingEmployeeId)
      emitLeaveLifecycle(this.eventEmitter, {
        companyId: a.company_id,
        eventKey: 'leave.acting.cancelled',
        title: 'Acting appointment withdrawn',
        message: `You are no longer the acting employee for ${absent} (${leave.leave_no}).`,
        employeeId: previousActingEmployeeId,
        senderCompanyUserId: actor.companyMembershipId ?? null,
        entityType: 'LEAVE_ACTING_ASSIGNMENT',
        entityId: a.id,
        dedupeKey: `leave-acting:${a.id}:replaced:${previousActingEmployeeId}`,
      });
  }

  async cancel(
    companyId: number,
    assignmentId: number,
    reason: string | null | undefined,
    actor: AuthenticatedUser,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LeaveActingAssignment);
      const a = await repo.findOne({
        where: { id: assignmentId, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!a) throw new NotFoundException('Acting assignment not found');
      const leave = await this.loadLeave(
        companyId,
        a.leave_request_id,
        manager,
      );
      await this.assertCanManage(leave, actor, manager);
      if (!OPEN.includes(a.status))
        throw new ConflictException(
          `This delegation is already ${a.status.toLowerCase()}.`,
        );
      if (a.status === S.ACTIVE && !this.isHr(actor))
        throw new ForbiddenException(
          'The delegation is active; only HR can end it.',
        );
      a.status = S.CANCELLED;
      a.cancelled_at = new Date();
      a.cancelled_by_company_user_id = actor.companyMembershipId ?? null;
      a.cancellation_reason = reason?.trim().slice(0, 500) || 'Withdrawn';
      await repo.save(a);
      await this.endApprovalRouting(a, manager);
      await this.leaveAuditService.log(
        {
          company_id: companyId,
          leave_request_id: a.leave_request_id,
          action: 'leave_acting.cancelled',
          entity_name: 'leave_acting_assignment',
          entity_id: a.id,
          actor,
          payload: { reason: a.cancellation_reason },
        },
        manager,
      );
      return { a, leave };
    });
    this.notifyEnded(result.a, result.leave, 'cancelled');
    return this.view(result.a.id);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Re-derives the assignment(s) of one leave request from the leave as it
   * is now. Safe to call any number of times, inside or outside a
   * transaction. Returns the assignments whose status changed (to notify).
   */
  async syncForLeaveRequest(
    leaveRequestId: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<
    Array<{ a: LeaveActingAssignment; leave: LeaveRequest; from: S }>
  > {
    const rows = await manager.getRepository(LeaveActingAssignment).find({
      where: { leave_request_id: leaveRequestId, status: In(OPEN) },
    });
    if (!rows.length) return [];
    const leave = await manager.getRepository(LeaveRequest).findOne({
      where: { id: leaveRequestId },
      relations: { employee: true },
    });
    if (!leave) return [];
    const changed: Array<{
      a: LeaveActingAssignment;
      leave: LeaveRequest;
      from: S;
    }> = [];
    for (const a of rows) {
      const from = a.status;
      if (await this.syncAssignment(a, leave, manager))
        if (a.status !== from) changed.push({ a, leave, from });
    }
    return changed;
  }

  /** Sync after a committed leave change, then notify; never throws. */
  async syncAfterCommit(leaveRequestId: number): Promise<void> {
    try {
      const changed = await this.dataSource.transaction((m) =>
        this.syncForLeaveRequest(leaveRequestId, m),
      );
      for (const c of changed) this.notifyTransition(c.a, c.leave);
    } catch (error) {
      this.logger.error(
        `Acting assignment sync failed for leave ${leaveRequestId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async syncAssignment(
    a: LeaveActingAssignment,
    leave: LeaveRequest,
    manager: EntityManager,
  ): Promise<boolean> {
    const plan = planActingSync(a, leave, this.today());
    if (!plan) {
      // Status unchanged (e.g. approved but not started yet): approval
      // routing is still due as soon as the leave is approved.
      if (OPEN.includes(a.status))
        await this.syncApprovalRouting(a, leave, null, manager);
      return false;
    }
    const from = a.status;
    a.status = plan.status;
    a.start_date = plan.start_date;
    a.end_date = plan.end_date;
    if (plan.status === S.ACTIVE && !a.activated_at)
      a.activated_at = new Date();
    if (plan.status === S.COMPLETED) a.completed_at = new Date();
    if (plan.status === S.CANCELLED) {
      a.cancelled_at = new Date();
      a.cancellation_reason = plan.reason ?? 'Leave withdrawn';
    }
    await manager.getRepository(LeaveActingAssignment).save(a);
    if (plan.status === S.CANCELLED || plan.status === S.COMPLETED)
      await this.endApprovalRouting(a, manager);
    else await this.syncApprovalRouting(a, leave, null, manager);
    await this.leaveAuditService.log(
      {
        company_id: a.company_id,
        leave_request_id: a.leave_request_id,
        action: 'leave_acting.synced',
        entity_name: 'leave_acting_assignment',
        entity_id: a.id,
        actor: undefined,
        payload: {
          from_status: from,
          to_status: a.status,
          start_date: a.start_date,
          end_date: a.end_date,
          leave_status: leave.status,
          reason: plan.reason ?? null,
        },
      },
      manager,
    );
    return true;
  }

  /** Daily just after midnight: activates / completes assignments by date. */
  @Cron('5 0 * * *')
  async runDaily(): Promise<{ checked: number; changed: number }> {
    let changed = 0;
    const open = await this.dataSource
      .getRepository(LeaveActingAssignment)
      .find({
        where: { status: In(OPEN) },
        select: ['id', 'leave_request_id'],
      });
    const leaveIds = [...new Set(open.map((o) => o.leave_request_id))];
    for (const id of leaveIds) {
      try {
        const result = await this.dataSource.transaction(async (m) => {
          await m.getRepository(LeaveRequest).findOne({
            where: { id },
            lock: { mode: 'pessimistic_write' },
          });
          return this.syncForLeaveRequest(id, m);
        });
        changed += result.length;
        for (const c of result) this.notifyTransition(c.a, c.leave);
      } catch (error) {
        this.logger.error(
          `Acting assignment daily sync failed for leave ${id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    this.logger.log(
      `Acting assignments: ${leaveIds.length} leave(s) checked, ${changed} changed`,
    );
    return { checked: leaveIds.length, changed };
  }

  /**
   * Optional, explicit approval routing: while the assignment is open, leave
   * approvals that would go to the absent employee go to the acting one.
   * Time-limited to the assignment dates; ended with it.
   */
  private async syncApprovalRouting(
    a: LeaveActingAssignment,
    leave: LeaveRequest,
    actor: AuthenticatedUser | null,
    manager: EntityManager,
  ): Promise<void> {
    if (!a.route_approvals) {
      await this.endApprovalRouting(a, manager);
      return;
    }
    if (leave.status !== LeaveStatusEnum.APPROVED) return;
    const [absent, acting] = await Promise.all([
      manager
        .getRepository(Employee)
        .findOne({ where: { id: a.absent_employee_id } }),
      manager
        .getRepository(Employee)
        .findOne({ where: { id: a.acting_employee_id } }),
    ]);
    if (!absent?.company_user_id || !acting?.company_user_id) return;
    const repo = manager.getRepository(LeaveApprovalDelegation);
    const existing = a.approval_delegation_id
      ? await repo.findOne({ where: { id: a.approval_delegation_id } })
      : null;
    if (existing && existing.status === 'active') {
      if (
        existing.start_date !== a.start_date ||
        existing.end_date !== a.end_date ||
        existing.delegate_company_user_id !== acting.company_user_id
      ) {
        existing.start_date = a.start_date;
        existing.end_date = a.end_date;
        existing.delegate_company_user_id = acting.company_user_id;
        await repo.save(existing);
      }
      return;
    }
    const created = await repo.save(
      repo.create({
        company_id: a.company_id,
        delegator_company_user_id: absent.company_user_id,
        delegate_company_user_id: acting.company_user_id,
        start_date: a.start_date,
        end_date: a.end_date,
        reason: `Acting employee for leave request #${a.leave_request_id}`,
        status: 'active',
        created_by_company_user_id:
          actor?.companyMembershipId ?? a.appointed_by_company_user_id,
      }),
    );
    a.approval_delegation_id = created.id;
    await manager.getRepository(LeaveActingAssignment).save(a);
  }

  private async endApprovalRouting(
    a: LeaveActingAssignment,
    manager: EntityManager,
  ): Promise<void> {
    if (!a.approval_delegation_id) return;
    await manager
      .getRepository(LeaveApprovalDelegation)
      .update(
        { id: a.approval_delegation_id, status: 'active' },
        { status: 'cancelled' },
      );
  }

  private notifyTransition(a: LeaveActingAssignment, leave: LeaveRequest) {
    if (a.status === S.ACTIVE)
      emitLeaveLifecycle(this.eventEmitter, {
        companyId: a.company_id,
        eventKey: 'leave.acting.activated',
        title: 'Your acting assignment has started',
        message: `You are now acting for ${this.name(leave.employee)} until ${a.end_date}.`,
        employeeId: a.acting_employee_id,
        entityType: 'LEAVE_ACTING_ASSIGNMENT',
        entityId: a.id,
        actionUrl: `/dashboard/employees/profile/${encodeURIComponent(leave.employee.employee_no)}`,
        dedupeKey: `leave-acting:${a.id}:activated`,
      });
    else if (a.status === S.COMPLETED) this.notifyEnded(a, leave, 'completed');
    else if (a.status === S.CANCELLED) this.notifyEnded(a, leave, 'cancelled');
  }

  private notifyEnded(
    a: LeaveActingAssignment,
    leave: LeaveRequest,
    how: 'completed' | 'cancelled',
  ) {
    emitLeaveLifecycle(this.eventEmitter, {
      companyId: a.company_id,
      eventKey:
        how === 'completed'
          ? 'leave.acting.completed'
          : 'leave.acting.cancelled',
      title:
        how === 'completed'
          ? 'Acting assignment completed'
          : 'Acting assignment cancelled',
      message:
        how === 'completed'
          ? `Your acting assignment for ${this.name(leave.employee)} ended on ${a.end_date}.`
          : `Your acting assignment for ${this.name(leave.employee)} (${a.start_date} – ${a.end_date}) was cancelled${a.cancellation_reason ? `: ${a.cancellation_reason}` : ''}.`,
      employeeId: a.acting_employee_id,
      entityType: 'LEAVE_ACTING_ASSIGNMENT',
      entityId: a.id,
      dedupeKey: `leave-acting:${a.id}:${how}`,
    });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  private name(
    e: Pick<Employee, 'first_name' | 'last_name'> | null | undefined,
  ) {
    return e ? `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() : '';
  }

  private person(e: Employee | null | undefined) {
    if (!e) return null;
    return {
      id: e.id,
      name: this.name(e),
      employee_no: e.employee_no,
      department_name: e.primary_department?.name ?? null,
      position_name: e.primary_position?.name ?? null,
    };
  }

  private toView(a: LeaveActingAssignment) {
    return {
      id: a.id,
      leave_request_id: a.leave_request_id,
      leave_no: a.leave_request?.leave_no ?? null,
      leave_type_name: a.leave_request?.leave_type?.name ?? null,
      leave_start_date: a.leave_request?.start_date ?? null,
      leave_end_date: a.leave_request?.end_date ?? null,
      leave_status: a.leave_request?.status ?? null,
      status: a.status,
      start_date: a.start_date,
      end_date: a.end_date,
      follows_leave_dates: a.follows_leave_dates,
      responsibilities: a.responsibilities,
      route_approvals: a.route_approvals,
      absent_employee: this.person(a.absent_employee),
      acting_employee: this.person(a.acting_employee),
      appointed_by: this.person(a.appointed_by_employee),
      activated_at: a.activated_at,
      completed_at: a.completed_at,
      cancelled_at: a.cancelled_at,
      cancellation_reason: a.cancellation_reason,
      replaced_by_assignment_id: a.replaced_by_assignment_id,
      created_at: a.created_at,
      updated_at: a.updated_at,
    };
  }

  private query(manager: EntityManager = this.dataSource.manager) {
    return manager
      .getRepository(LeaveActingAssignment)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.leave_request', 'lr')
      .leftJoinAndSelect('lr.leave_type', 'lt')
      .leftJoinAndSelect('a.absent_employee', 'absent')
      .leftJoinAndSelect('absent.primary_department', 'absent_dep')
      .leftJoinAndSelect('absent.primary_position', 'absent_pos')
      .leftJoinAndSelect('a.acting_employee', 'acting')
      .leftJoinAndSelect('acting.primary_department', 'acting_dep')
      .leftJoinAndSelect('acting.primary_position', 'acting_pos')
      .leftJoinAndSelect('a.appointed_by_employee', 'appointer')
      .leftJoinAndSelect('appointer.primary_position', 'appointer_pos');
  }

  async view(id: number) {
    const a = await this.query().where('a.id = :id', { id }).getOne();
    if (!a) throw new NotFoundException('Acting assignment not found');
    return this.toView(a);
  }

  /** Current assignment plus history for one leave request (any viewer of the request). */
  async forLeaveRequest(companyId: number, leaveRequestId: number) {
    const rows = await this.query()
      .where('a.company_id = :companyId', { companyId })
      .andWhere('a.leave_request_id = :leaveRequestId', { leaveRequestId })
      .orderBy('a.id', 'DESC')
      .getMany();
    const views = rows.map((r) => this.toView(r));
    return {
      current: views.find((v) => v.status !== S.CANCELLED) ?? null,
      history: views,
    };
  }

  /** Same as forLeaveRequest, after checking the actor may see the employee. */
  async forLeaveRequestAsActor(
    companyId: number,
    leaveRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const leave = await this.loadLeave(
      companyId,
      leaveRequestId,
      this.dataSource.manager,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, leave.employee);
    let canManage = true;
    try {
      await this.assertCanManage(leave, actor, this.dataSource.manager);
    } catch {
      canManage = false;
    }
    return {
      ...(await this.forLeaveRequest(companyId, leaveRequestId)),
      can_manage: canManage,
    };
  }

  /** Leave-request PDF / payload helper: open or completed assignment. */
  async currentForLeave(companyId: number, leaveRequestId: number) {
    return (await this.forLeaveRequest(companyId, leaveRequestId)).current;
  }

  /**
   * Employee profile: assignments where the employee is absent (covered by
   * someone) and where they act for someone, plus history.
   */
  async forEmployee(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.dataSource.getRepository(Employee).findOne({
      where: { id: employeeId, company_id: companyId },
      relations: { primary_department: true, primary_position: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    const rows = await this.query()
      .where('a.company_id = :companyId', { companyId })
      .andWhere('(a.absent_employee_id = :id OR a.acting_employee_id = :id)', {
        id: employeeId,
      })
      .orderBy('a.start_date', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .take(100)
      .getMany();
    const views = rows.map((r) => this.toView(r));
    const today = this.today();
    const onLeave = await this.dataSource
      .getRepository(LeaveRequest)
      .createQueryBuilder('lr')
      .leftJoinAndSelect('lr.leave_type', 'lt')
      .where('lr.company_id = :companyId', { companyId })
      .andWhere('lr.employee_id = :employeeId', { employeeId })
      .andWhere('lr.status = :approved', { approved: LeaveStatusEnum.APPROVED })
      .andWhere('lr.start_date <= :today AND lr.end_date >= :today', { today })
      .getOne();
    const covering = onLeave
      ? (views.find(
          (v) =>
            v.leave_request_id === onLeave.id &&
            v.absent_employee?.id === employeeId &&
            v.status !== S.CANCELLED,
        ) ?? null)
      : null;
    return {
      current_leave: onLeave
        ? {
            leave_request_id: onLeave.id,
            leave_no: onLeave.leave_no,
            leave_type_name: onLeave.leave_type?.name ?? null,
            start_date: onLeave.start_date,
            end_date: onLeave.end_date,
            acting_assignment: covering,
          }
        : null,
      acting_for: views.filter(
        (v) => v.acting_employee?.id === employeeId && OPEN.includes(v.status),
      ),
      covered_by: views.filter(
        (v) => v.absent_employee?.id === employeeId && OPEN.includes(v.status),
      ),
      history: views.filter((v) => !OPEN.includes(v.status)),
    };
  }

  /**
   * Directory: who is on approved leave today and who covers. Medical leave
   * types are shown only as "On leave" (no type), never with reasons.
   */
  async directoryAvailability(companyId: number, employeeIds: number[]) {
    if (!employeeIds.length) return new Map<number, DirectoryAvailability>();
    const today = this.today();
    const leaves = await this.dataSource
      .getRepository(LeaveRequest)
      .createQueryBuilder('lr')
      .leftJoinAndSelect('lr.leave_type', 'lt')
      .where('lr.company_id = :companyId', { companyId })
      .andWhere('lr.employee_id IN (:...employeeIds)', { employeeIds })
      .andWhere('lr.status = :approved', { approved: LeaveStatusEnum.APPROVED })
      .andWhere('lr.start_date <= :today AND lr.end_date >= :today', { today })
      .getMany();
    const result = new Map<number, DirectoryAvailability>();
    if (!leaves.length) return result;
    const assignments = await this.query()
      .where('a.leave_request_id IN (:...ids)', {
        ids: leaves.map((l) => l.id),
      })
      .andWhere('a.status IN (:...open)', { open: OPEN })
      .getMany();
    for (const leave of leaves) {
      const a = assignments.find((x) => x.leave_request_id === leave.id);
      const medical = /sick|medical|hospital|maternity|paternity/i.test(
        `${leave.leave_type?.name ?? ''} ${leave.leave_type?.code ?? ''}`,
      );
      result.set(leave.employee_id, {
        status_label: medical
          ? 'On leave'
          : `On ${leave.leave_type?.name ?? 'leave'}`,
        leave_end_date: String(leave.end_date).slice(0, 10),
        acting_employee:
          a && a.start_date <= today && a.end_date >= today
            ? {
                id: a.acting_employee.id,
                name: this.name(a.acting_employee),
                employee_no: a.acting_employee.employee_no,
                position_name: a.acting_employee.primary_position?.name ?? null,
              }
            : null,
      });
    }
    return result;
  }

  /** Approver-facing candidate check (no writes). */
  async checkCandidate(
    companyId: number,
    leaveRequestId: number,
    actingEmployeeId: number,
    start: string | undefined,
    end: string | undefined,
    actor: AuthenticatedUser,
  ) {
    const leave = await this.loadLeave(
      companyId,
      leaveRequestId,
      this.dataSource.manager,
    );
    await this.assertCanManage(leave, actor, this.dataSource.manager);
    const { employee, warnings } = await this.validateCandidate(
      companyId,
      leave,
      actingEmployeeId,
      (start || String(leave.start_date)).slice(0, 10),
      (end || String(leave.end_date)).slice(0, 10),
    );
    return { ok: true, employee: this.person(employee), warnings };
  }
}

export type DirectoryAvailability = {
  status_label: string;
  leave_end_date: string;
  acting_employee: {
    id: number;
    name: string;
    employee_no: string;
    position_name: string | null;
  } | null;
};
