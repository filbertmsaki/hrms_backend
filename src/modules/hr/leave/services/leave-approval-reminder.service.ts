import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager, In } from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Employee } from '../../employees/entities/employee.entity';
import {
  LeaveApprovalReminderEvent,
  LeaveApprovalRequiredEvent,
} from '../../notifications/events';
import { buildNotificationRecipient } from '../../notifications/notification-recipient.util';
import { LeaveApprovalWorkflow } from '../entities/leave-approval-workflow.entity';
import { LeaveRequestApproval } from '../entities/leave-request-approval.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveApprovalStatusEnum } from '../enums/leave-approval-status.enum';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import { LeaveAuditService } from './leave-audit.service';
import { LeaveWorkflowService } from './leave-workflow.service';

const DAY_MS = 86_400_000;

export type EscalationAction = 'none' | 'escalate' | 'flag_overdue';

/**
 * Decides the escalation step for a waiting stage. Escalates every
 * `escalateAfterDays` (measured from the stage start, then from the last
 * escalation) up to `maxEscalations` times; one further interval later HR is
 * flagged once.
 */
export function nextEscalationAction(input: {
  now: Date;
  stageStart: Date;
  escalateAfterDays: number | null;
  maxEscalations: number;
  escalationCount: number;
  lastEscalatedAt: Date | null;
  overdueFlaggedAt: Date | null;
}): EscalationAction {
  const interval = input.escalateAfterDays;
  if (!interval) return 'none';
  const since = input.lastEscalatedAt ?? input.stageStart;
  const waited = Math.floor(
    (input.now.getTime() - new Date(since).getTime()) / DAY_MS,
  );
  if (waited < interval) return 'none';
  // Rows escalated before max_escalations existed have a timestamp but no count.
  const count = Math.max(input.escalationCount, input.lastEscalatedAt ? 1 : 0);
  if (count < Math.max(1, input.maxEscalations)) return 'escalate';
  return input.overdueFlaggedAt ? 'none' : 'flag_overdue';
}
const PENDING_STATUSES = [
  LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
  LeaveStatusEnum.PENDING_HR,
  LeaveStatusEnum.IN_REVIEW,
];

/**
 * Daily: reminds approvers of leave waiting longer than the workflow's
 * reminder interval, and escalates a stage every escalation interval (up to
 * max_escalations) by adding the waiting approvers' own managers (or HR) as
 * approvers. Each escalation climbs one level, because the previously added
 * approvers are among the waiting ones. After the last escalation, HR is
 * flagged once that the request is overdue.
 */
@Injectable()
export class LeaveApprovalReminderService {
  private readonly logger = new Logger(LeaveApprovalReminderService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly leaveWorkflowService: LeaveWorkflowService,
    private readonly leaveAuditService: LeaveAuditService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  @Cron('0 8 * * *')
  async runDaily(): Promise<void> {
    try {
      const result = await this.processPending();
      this.logger.log(
        `Leave approval reminders: ${result.reminded} reminded, ${result.escalated} escalated`,
      );
    } catch (error) {
      this.logger.error(
        'Leave approval reminder run failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async processPending(now: Date = new Date()) {
    const requests = await this.dataSource.getRepository(LeaveRequest).find({
      where: { status: In(PENDING_STATUSES), routing_required: false },
      select: ['id'],
    });
    let reminded = 0;
    let escalated = 0;
    for (const { id } of requests) {
      try {
        const outcome = await this.dataSource.transaction((manager) =>
          this.processRequest(id, now, manager),
        );
        if (outcome.reminded) reminded += 1;
        if (outcome.escalated) escalated += 1;
      } catch (error) {
        this.logger.error(
          `Reminder/escalation failed for leave request ${id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return { checked: requests.length, reminded, escalated };
  }

  private async processRequest(
    id: number,
    now: Date,
    manager: EntityManager,
  ): Promise<{ reminded: boolean; escalated: boolean }> {
    const none = { reminded: false, escalated: false };
    const locked = await manager.getRepository(LeaveRequest).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!locked || !PENDING_STATUSES.includes(locked.status)) return none;
    const request = await manager.getRepository(LeaveRequest).findOneOrFail({
      where: { id },
      relations: { employee: true, leave_type: true },
    });

    const workflow = await this.findWorkflow(manager, request);
    if (!workflow?.reminder_after_days && !workflow?.escalate_after_days) {
      return none;
    }
    const stageStart = request.stage_entered_at ?? request.applied_at;
    if (!stageStart) return none;
    const daysWaiting = Math.floor(
      (now.getTime() - new Date(stageStart).getTime()) / DAY_MS,
    );

    const pending = await manager.getRepository(LeaveRequestApproval).find({
      where: {
        leave_request_id: request.id,
        approval_cycle: request.approval_cycle,
        approval_level: request.current_approval_level,
        status: LeaveApprovalStatusEnum.PENDING,
      },
    });
    const approverIds = [
      ...new Set(
        pending
          .map((row) => row.approver_company_user_id)
          .filter((value): value is number => !!value),
      ),
    ];
    if (!approverIds.length) return none;

    const employeeName = `${request.employee.first_name} ${request.employee.last_name}`;
    const appUrl = (
      this.configService.get<string>('APP_FRONTEND_URL') ?? ''
    ).replace(/\/$/, '');
    const reviewUrl = `${appUrl}/dashboard/leave-management/requests?highlight=${request.id}`;
    const events: Array<() => void> = [];
    let reminded = false;
    let escalated = false;

    const action = nextEscalationAction({
      now,
      stageStart: new Date(stageStart),
      escalateAfterDays: workflow.escalate_after_days,
      maxEscalations: workflow.max_escalations ?? 1,
      escalationCount: request.stage_escalation_count ?? 0,
      lastEscalatedAt: request.stage_escalated_at,
      overdueFlaggedAt: request.stage_overdue_flagged_at,
    });
    if (action === 'flag_overdue') {
      const hrIds = (
        await this.leaveWorkflowService.resolveHrApproverMembershipIds(
          request.company_id,
          request.leave_type_id,
          manager,
        )
      ).filter((id) => id !== request.employee.company_user_id);
      const notify = [...new Set([...hrIds, ...approverIds])];
      events.push(() =>
        this.eventEmitter.emit(
          LeaveApprovalReminderEvent.EVENT,
          new LeaveApprovalReminderEvent(
            employeeName,
            request.leave_type?.name ?? 'Leave',
            daysWaiting,
            notify,
            reviewUrl,
            request.id,
            request.approval_cycle,
            request.current_approval_level,
            request.company_id,
          ),
        ),
      );
      request.stage_overdue_flagged_at = now;
      escalated = true;
      await this.leaveAuditService.log(
        {
          company_id: request.company_id,
          leave_request_id: request.id,
          action: 'leave_request.overdue_flagged',
          entity_name: 'leave_request',
          entity_id: request.id,
          actor: undefined,
          payload: {
            approval_level: request.current_approval_level,
            days_waiting: daysWaiting,
            escalations: request.stage_escalation_count,
            notified_company_user_ids: notify,
          },
        },
        manager,
      );
    }
    if (action === 'escalate') {
      const targets = await this.resolveEscalationTargets(
        manager,
        request,
        approverIds,
      );
      if (targets.length) {
        const repository = manager.getRepository(LeaveRequestApproval);
        await repository.save(
          targets.map((companyUserId) =>
            repository.create({
              leave_request_id: request.id,
              workflow_step_id: null,
              approval_level: request.current_approval_level,
              approval_cycle: request.approval_cycle,
              approver_company_user_id: companyUserId,
              status: LeaveApprovalStatusEnum.PENDING,
              comments: `Escalated after ${daysWaiting} day(s) without a decision`,
            }),
          ),
        );
        const recipients = await this.recipients(manager, [
          ...approverIds,
          ...targets,
        ]);
        events.push(() =>
          this.eventEmitter.emit(
            LeaveApprovalRequiredEvent.EVENT,
            new LeaveApprovalRequiredEvent(
              employeeName,
              request.leave_type?.name ?? 'Leave',
              request.start_date,
              request.end_date,
              Number(request.total_days),
              recipients,
              reviewUrl,
              request.id,
              request.company_id,
              null,
              request.approval_cycle,
            ),
          ),
        );
      }
      request.stage_escalated_at = now;
      request.stage_escalation_count =
        Math.max(request.stage_escalation_count ?? 0, 0) + 1;
      escalated = true;
      await this.leaveAuditService.log(
        {
          company_id: request.company_id,
          leave_request_id: request.id,
          action: 'leave_request.escalated',
          entity_name: 'leave_request',
          entity_id: request.id,
          actor: undefined,
          payload: {
            approval_level: request.current_approval_level,
            days_waiting: daysWaiting,
            escalation_number: request.stage_escalation_count,
            escalated_to_company_user_ids: targets,
            note: targets.length ? null : 'No escalation target found',
          },
        },
        manager,
      );
    }

    // Remind every N days while the stage is waiting.
    const remindAfter = workflow.reminder_after_days;
    const lastReminder = request.stage_reminded_at
      ? new Date(request.stage_reminded_at).getTime()
      : null;
    if (
      !escalated &&
      remindAfter &&
      daysWaiting >= remindAfter &&
      (lastReminder === null ||
        now.getTime() - lastReminder >= remindAfter * DAY_MS)
    ) {
      events.push(() =>
        this.eventEmitter.emit(
          LeaveApprovalReminderEvent.EVENT,
          new LeaveApprovalReminderEvent(
            employeeName,
            request.leave_type?.name ?? 'Leave',
            daysWaiting,
            approverIds,
            reviewUrl,
            request.id,
            request.approval_cycle,
            request.current_approval_level,
            request.company_id,
          ),
        ),
      );
      request.stage_reminded_at = now;
      reminded = true;
      await this.leaveAuditService.log(
        {
          company_id: request.company_id,
          leave_request_id: request.id,
          action: 'leave_request.reminder_sent',
          entity_name: 'leave_request',
          entity_id: request.id,
          actor: undefined,
          payload: {
            approval_level: request.current_approval_level,
            days_waiting: daysWaiting,
            approver_company_user_ids: approverIds,
          },
        },
        manager,
      );
    }

    if (reminded || escalated) {
      await manager.getRepository(LeaveRequest).save(request);
      // Notify only after the transaction work above succeeded.
      for (const emit of events) emit();
    }
    return { reminded, escalated };
  }

  private async findWorkflow(
    manager: EntityManager,
    request: LeaveRequest,
  ): Promise<LeaveApprovalWorkflow | null> {
    const repository = manager.getRepository(LeaveApprovalWorkflow);
    return (
      (await repository.findOne({
        where: {
          company_id: request.company_id,
          leave_type_id: request.leave_type_id,
          status: LeaveRecordStatusEnum.ACTIVE,
        },
      })) ??
      (await repository.findOne({
        where: {
          company_id: request.company_id,
          is_default: true,
          status: LeaveRecordStatusEnum.ACTIVE,
        },
      }))
    );
  }

  /**
   * The waiting approvers' own managers; if none exist (or the stage is
   * not HR), HR approvers. Never the applicant or a current approver.
   */
  private async resolveEscalationTargets(
    manager: EntityManager,
    request: LeaveRequest,
    approverIds: number[],
  ): Promise<number[]> {
    const employees = manager.getRepository(Employee);
    const approverEmployees = await employees.find({
      where: {
        company_id: request.company_id,
        company_user_id: In(approverIds),
      },
      select: ['id', 'reports_to'],
    });
    const managerIds = [
      ...new Set(
        approverEmployees
          .map((row) => row.reports_to)
          .filter((value): value is number => !!value),
      ),
    ];
    let targets = managerIds.length
      ? (
          await employees.find({
            where: { company_id: request.company_id, id: In(managerIds) },
            select: ['id', 'company_user_id'],
          })
        )
          .map((row) => row.company_user_id)
          .filter((value): value is number => !!value)
      : [];
    if (!targets.length && request.status !== LeaveStatusEnum.PENDING_HR) {
      targets = await this.leaveWorkflowService.resolveHrApproverMembershipIds(
        request.company_id,
        request.leave_type_id,
        manager,
      );
    }
    const delegated = await this.leaveWorkflowService.applyDelegations(
      request.company_id,
      targets,
      request.employee.company_user_id,
      manager,
    );
    return delegated
      .map((row) => row.companyUserId)
      .filter(
        (id) =>
          id !== request.employee.company_user_id && !approverIds.includes(id),
      );
  }

  private async recipients(manager: EntityManager, companyUserIds: number[]) {
    const memberships = await manager.getRepository(CompanyUser).find({
      where: { id: In(companyUserIds) },
      relations: { user: true },
    });
    return memberships.flatMap((membership) => {
      const recipient = buildNotificationRecipient(membership.user, {
        companyUserId: membership.id,
      });
      return recipient ? [recipient] : [];
    });
  }
}
