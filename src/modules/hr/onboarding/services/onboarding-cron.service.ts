import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { OnboardingTask } from '../entities/onboarding-task.entity';
import { OnboardingApproval } from '../entities/onboarding-approval.entity';
import { OnboardingRequest } from '../entities/onboarding-request.entity';
import {
  isOnboardingStepReady,
  isOnboardingTaskReady,
} from '../utils/workflow-readiness';
import { OnboardingTaskStatusEnum } from '../enums/onboarding-task-status.enum';
import {
  onboardingPositionId,
  resolvePositionMembers,
} from '../utils/position-assignment';
import { OnboardingApprovalStatusEnum } from '../enums/onboarding-approval-status.enum';
import { OnboardingRequestStatusEnum } from '../enums/onboarding-request-status.enum';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Document } from '../../documents/entities/document.entity';
import { DocumentEntityTypeEnum } from '../../documents/enums/document-entity-type.enum';
import {
  OnboardingApprovalReminderEvent,
  OnboardingDocumentReminderEvent,
  OnboardingTaskOverdueEvent,
} from '../../notifications/events';

@Injectable()
export class OnboardingCronService {
  private readonly logger = new Logger(OnboardingCronService.name);

  constructor(
    @InjectRepository(OnboardingTask)
    private readonly taskRepository: Repository<OnboardingTask>,
    @InjectRepository(OnboardingApproval)
    private readonly approvalRepository: Repository<OnboardingApproval>,
    @InjectRepository(OnboardingRequest)
    private readonly requestRepository: Repository<OnboardingRequest>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async handleOverdueTasksAndStaleApprovals() {
    this.logger.log('Running onboarding escalation check');
    await Promise.allSettled([
      this.notifyOverdueTasks(),
      this.notifyStaleApprovals(),
      this.notifyCandidatesWithOutstandingDocuments(),
    ]);
  }

  private async notifyCandidatesWithOutstandingDocuments() {
    const reminderHours = Math.max(
      1,
      this.configService.get<number>('ONBOARDING_DOCUMENT_REMINDER_HOURS', 48),
    );
    const cutoff = new Date(Date.now() - reminderHours * 60 * 60 * 1000);
    const requests = await this.requestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.employee', 'employee')
      .leftJoinAndSelect('employee.company_user', 'companyUser')
      .leftJoinAndSelect('request.tasks', 'task')
      .where('request.status IN (:...statuses)', {
        statuses: [
          OnboardingRequestStatusEnum.SUBMITTED,
          OnboardingRequestStatusEnum.IN_PROGRESS,
          OnboardingRequestStatusEnum.IN_REVIEW,
        ],
      })
      .andWhere('request.created_at <= :cutoff', { cutoff })
      .getMany();

    let emitted = 0;
    for (const request of requests) {
      const recipientId = request.employee?.company_user?.id;
      if (!recipientId) continue;
      const requiredTypes = [
        ...new Set(
          (request.tasks ?? [])
            .filter(
              (task) => task.is_required && task.required_document_type_code,
            )
            .map((task) =>
              task.required_document_type_code!.trim().toLowerCase(),
            ),
        ),
      ];
      if (!requiredTypes.length) continue;

      const documents = await this.documentRepository.find({
        where: {
          company_id: request.company_id,
          entity_type: DocumentEntityTypeEnum.ONBOARDING,
          entity_id: request.id,
        },
      });
      const outstanding = requiredTypes.filter((type) => {
        const matching = documents.filter(
          (document) => document.document_type?.trim().toLowerCase() === type,
        );
        return !matching.some((document) => {
          const storedReviewStatus =
            document.metadata?.onboarding_review_status;
          const reviewStatus =
            typeof storedReviewStatus === 'string'
              ? storedReviewStatus.toLowerCase()
              : document.is_verified
                ? 'approved'
                : 'submitted';
          return reviewStatus !== 'rejected' && reviewStatus !== 'superseded';
        });
      });
      if (!outstanding.length) continue;

      const shouldSend = await this.requestRepository.manager.transaction(
        async (manager) => {
          const repository = manager.getRepository(OnboardingRequest);
          const current = await repository.findOne({
            where: { id: request.id, company_id: request.company_id },
            lock: { mode: 'pessimistic_write' },
          });
          if (
            !current ||
            ![
              OnboardingRequestStatusEnum.SUBMITTED,
              OnboardingRequestStatusEnum.IN_PROGRESS,
              OnboardingRequestStatusEnum.IN_REVIEW,
            ].includes(current.status) ||
            current.completed_at ||
            current.cancelled_at
          )
            return false;
          const lastSent = current.metadata?.document_reminder_last_sent_at;
          if (typeof lastSent === 'string' && new Date(lastSent) > cutoff)
            return false;
          current.metadata = {
            ...(current.metadata ?? {}),
            document_reminder_last_sent_at: new Date().toISOString(),
            document_reminder_count:
              Number(current.metadata?.document_reminder_count ?? 0) + 1,
          };
          await repository.save(current);
          return true;
        },
      );
      if (!shouldSend) continue;

      const employeeName = [
        request.employee?.first_name,
        request.employee?.last_name,
      ]
        .filter(Boolean)
        .join(' ');
      this.eventEmitter.emit(
        OnboardingDocumentReminderEvent.EVENT,
        new OnboardingDocumentReminderEvent(
          request.company_id,
          request.id,
          request.onboarding_no,
          employeeName || 'Candidate',
          recipientId,
          outstanding,
        ),
      );
      emitted += 1;
    }
    this.logger.log(
      `Emitted document reminders for ${emitted} onboarding requests`,
    );
  }

  private async notifyOverdueTasks() {
    const reminderCutoff = new Date(
      Date.now() -
        Math.max(
          1,
          this.configService.get<number>('ONBOARDING_TASK_REMINDER_HOURS', 24),
        ) *
          60 *
          60 *
          1000,
    );
    const activeStatuses = [
      OnboardingRequestStatusEnum.SUBMITTED,
      OnboardingRequestStatusEnum.IN_PROGRESS,
      OnboardingRequestStatusEnum.IN_REVIEW,
    ];

    const overdueTasks = await this.taskRepository
      .createQueryBuilder('task')
      .innerJoin('task.onboarding_request', 'req')
      .where('task.status IN (:...taskStatuses)', {
        taskStatuses: [
          OnboardingTaskStatusEnum.PENDING,
          OnboardingTaskStatusEnum.IN_PROGRESS,
        ],
      })
      .andWhere('task.due_date < NOW()')
      .andWhere(
        '(task.last_reminder_at IS NULL OR task.last_reminder_at < :reminderCutoff)',
        {
          reminderCutoff,
        },
      )
      .andWhere('req.status IN (:...reqStatuses)', {
        reqStatuses: activeStatuses,
      })
      .leftJoinAndSelect('task.onboarding_request', 'request')
      .leftJoinAndSelect('request.employee', 'employee')
      .leftJoinAndSelect('task.workflow_step', 'workflowStep')
      .leftJoinAndSelect('request.tasks', 'requestTask')
      .leftJoinAndSelect('requestTask.workflow_step', 'requestTaskStep')
      .leftJoinAndSelect('request.approvals', 'requestApproval')
      .getMany();

    for (const task of overdueTasks) {
      if (!isOnboardingTaskReady(task.onboarding_request, task)) continue;
      const employeeName = task.onboarding_request?.employee
        ? `${task.onboarding_request.employee.first_name} ${task.onboarding_request.employee.last_name}`
        : 'Unknown';

      const recipientIds = await this.resolveTaskRecipientIds(task);
      if (
        !recipientIds.length ||
        !(await this.claimReminder('task', task.id, reminderCutoff))
      )
        continue;
      for (const recipientId of recipientIds) {
        this.eventEmitter.emit(
          OnboardingTaskOverdueEvent.EVENT,
          new OnboardingTaskOverdueEvent(
            task.onboarding_request.company_id,
            task.onboarding_request_id,
            task.id,
            task.title,
            employeeName,
            recipientId,
            task.due_date!,
          ),
        );
      }
    }

    this.logger.log(`Emitted overdue events for ${overdueTasks.length} tasks`);
  }

  private async resolveTaskRecipientIds(
    task: OnboardingTask,
  ): Promise<number[]> {
    const positionId = onboardingPositionId(task.workflow_step?.metadata);
    if (!task.assigned_company_user_id && positionId) {
      const members = await resolvePositionMembers(
        this.companyUserRepository,
        task.onboarding_request.company_id,
        positionId,
      );
      return [...new Set(members.map((member) => member.id))];
    }
    const conditions: string[] = [];
    const parameters: Record<string, number> = {
      companyId: task.onboarding_request.company_id,
    };
    const query = this.companyUserRepository
      .createQueryBuilder('companyUser')
      .where('companyUser.company_id = :companyId', parameters)
      .andWhere("LOWER(companyUser.status) = 'active'")
      .distinct(true);

    if (task.assigned_company_user_id) {
      conditions.push('companyUser.id = :assignedUserId');
      parameters.assignedUserId = task.assigned_company_user_id;
    } else if (task.assigned_department_id) {
      query
        .leftJoin('companyUser.employee', 'employee')
        .leftJoin('employee.department_assignments', 'departmentAssignment');
      conditions.push('employee.primary_department_id = :departmentId');
      conditions.push('departmentAssignment.department_id = :departmentId');
      parameters.departmentId = task.assigned_department_id;
    } else if (task.workflow_step?.assigned_role_id) {
      query.leftJoin('companyUser.role_assignments', 'roleAssignment');
      conditions.push('roleAssignment.role_id = :roleId');
      parameters.roleId = task.workflow_step.assigned_role_id;
    }

    if (!conditions.length) {
      return [];
    }

    const recipients = await query
      .andWhere(`(${conditions.join(' OR ')})`, parameters)
      .select('companyUser.id', 'id')
      .getRawMany<{ id: number | string }>();

    return recipients.map((recipient) => Number(recipient.id));
  }

  private async notifyStaleApprovals() {
    const reminderDays = this.configService.get<number>(
      'ONBOARDING_APPROVAL_REMINDER_DAYS',
      2,
    );

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - reminderDays);

    const activeStatuses = [
      OnboardingRequestStatusEnum.SUBMITTED,
      OnboardingRequestStatusEnum.IN_PROGRESS,
      OnboardingRequestStatusEnum.IN_REVIEW,
    ];

    const staleApprovals = await this.approvalRepository
      .createQueryBuilder('approval')
      .innerJoin('approval.onboarding_request', 'req')
      .where('approval.status = :status', {
        status: OnboardingApprovalStatusEnum.PENDING,
      })
      .andWhere('approval.approval_level = req.current_approval_level')
      .andWhere('approval.created_at < :cutoff', { cutoff })
      .andWhere(
        '(approval.last_reminder_at IS NULL OR approval.last_reminder_at < :cutoff)',
        { cutoff },
      )
      .andWhere('req.status IN (:...reqStatuses)', {
        reqStatuses: activeStatuses,
      })
      .leftJoinAndSelect('approval.onboarding_request', 'request')
      .leftJoinAndSelect('request.employee', 'employee')
      .leftJoinAndSelect('request.tasks', 'requestTask')
      .leftJoinAndSelect('requestTask.workflow_step', 'requestTaskStep')
      .leftJoinAndSelect('request.approvals', 'requestApproval')
      .getMany();

    for (const approval of staleApprovals) {
      if (
        !isOnboardingStepReady(
          approval.onboarding_request,
          approval.approval_level,
        )
      )
        continue;
      if (
        !approval.approver_company_user_id ||
        !(await this.claimReminder('approval', approval.id, cutoff))
      )
        continue;
      const employeeName = approval.onboarding_request?.employee
        ? `${approval.onboarding_request.employee.first_name} ${approval.onboarding_request.employee.last_name}`
        : 'Unknown';

      this.eventEmitter.emit(
        OnboardingApprovalReminderEvent.EVENT,
        new OnboardingApprovalReminderEvent(
          approval.onboarding_request.company_id,
          approval.onboarding_request_id,
          approval.id,
          approval.approval_level,
          employeeName,
          approval.approver_company_user_id
            ? [approval.approver_company_user_id]
            : [],
        ),
      );
    }

    this.logger.log(
      `Emitted reminder events for ${staleApprovals.length} stale approvals`,
    );
  }

  private async claimReminder(
    kind: 'task' | 'approval',
    id: number,
    cutoff: Date,
  ): Promise<boolean> {
    return this.requestRepository.manager.transaction(async (manager) => {
      const repository =
        kind === 'task'
          ? manager.getRepository(OnboardingTask)
          : manager.getRepository(OnboardingApproval);
      const current = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !current ||
        (current.last_reminder_at && current.last_reminder_at >= cutoff)
      )
        return false;
      const request = await manager.getRepository(OnboardingRequest).findOne({
        where: { id: current.onboarding_request_id },
        relations: { tasks: { workflow_step: true }, approvals: true },
      });
      if (!request) return false;
      if (kind === 'task') {
        const task = request.tasks.find((entry) => entry.id === id);
        if (
          !task ||
          !task.due_date ||
          new Date(task.due_date) >= new Date() ||
          !isOnboardingTaskReady(request, task)
        )
          return false;
        current.last_reminder_at = new Date();
        current.reminder_count = (current.reminder_count ?? 0) + 1;
        await manager
          .getRepository(OnboardingTask)
          .save(current as OnboardingTask);
      } else {
        const approval = current as OnboardingApproval;
        if (
          approval.status !== OnboardingApprovalStatusEnum.PENDING ||
          approval.approval_level !== request.current_approval_level ||
          !isOnboardingStepReady(request, approval.approval_level)
        )
          return false;
        approval.last_reminder_at = new Date();
        approval.reminder_count = (approval.reminder_count ?? 0) + 1;
        await manager.getRepository(OnboardingApproval).save(approval);
      }
      return true;
    });
  }
}
