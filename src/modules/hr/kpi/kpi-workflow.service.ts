import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { NotificationCategoryEnum } from '../../notifications/enums/notification-category.enum';
import { NotificationChannelEnum } from '../../notifications/enums/notification-channel.enum';
import { NotificationsService } from '../../notifications/notifications.service';
import { ActionItemsService } from '../action-inbox/action-items.service';
import { ActionItem } from '../action-inbox/entities/action-item.entity';
import { ActionItemStatusEnum } from '../action-inbox/enums/action-item-status.enum';
import { ActionItemTypeEnum } from '../action-inbox/enums/action-item-type.enum';
import { KpiDefinition, KpiDefinitionVersion, KpiPeriod } from './kpi.entities';
import { KpiService } from './kpi.service';
import { ScorecardService } from './scorecard.service';
import { AchievementService } from './achievement.service';
import { EvaluationService } from './evaluation.service';

export const KPI_WORKFLOW_STAGES = [
  {
    id: 'setup',
    name: 'Setup',
    description: 'Prepare reporting periods and reusable configuration.',
    roles: ['COMPANY_ADMIN', 'HR_MANAGER'],
    next: ['define'],
  },
  {
    id: 'define',
    name: 'Define',
    description: 'Create and publish KPI definitions.',
    roles: ['COMPANY_ADMIN', 'HR_MANAGER'],
    next: ['assign'],
  },
  {
    id: 'assign',
    name: 'Assign',
    description: 'Assign published KPIs with targets and periods.',
    roles: [
      'COMPANY_ADMIN',
      'HR_MANAGER',
      'DEPARTMENT_MANAGER',
      'BRANCH_MANAGER',
    ],
    next: ['track'],
  },
  {
    id: 'track',
    name: 'Track',
    description: 'Configure scorecards and view assigned measures.',
    roles: [
      'COMPANY_ADMIN',
      'HR_MANAGER',
      'DEPARTMENT_MANAGER',
      'BRANCH_MANAGER',
      'EMPLOYEE',
    ],
    next: ['submit'],
  },
  {
    id: 'submit',
    name: 'Submit',
    description: 'Record and submit actual achievements.',
    roles: ['EMPLOYEE'],
    next: ['review'],
  },
  {
    id: 'review',
    name: 'Review',
    description: 'Review achievement and appraisal submissions.',
    roles: [
      'COMPANY_ADMIN',
      'HR_MANAGER',
      'DEPARTMENT_MANAGER',
      'BRANCH_MANAGER',
    ],
    next: ['approve'],
  },
  {
    id: 'approve',
    name: 'Approve',
    description: 'Approve eligible results and evaluations.',
    roles: [
      'COMPANY_ADMIN',
      'HR_MANAGER',
      'DEPARTMENT_MANAGER',
      'BRANCH_MANAGER',
    ],
    next: ['close'],
  },
  {
    id: 'close',
    name: 'Close',
    description:
      'Finalize evaluations or close cycles; acknowledgement and disputes remain separate.',
    roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'EMPLOYEE'],
    next: [],
  },
] as const;
export type WorkflowStageId = (typeof KPI_WORKFLOW_STAGES)[number]['id'];
export type WorkflowAction = {
  id: string;
  stage: WorkflowStageId;
  title: string;
  description: string;
  owner: string;
  href: string;
  recordId?: number;
  dueDate?: string | null;
  count?: number;
  blocked?: boolean;
  reason?: string;
  resolveHref?: string;
};
export type WorkflowRecord = {
  kind:
    | 'definition'
    | 'assignment'
    | 'achievement'
    | 'scorecard'
    | 'evaluation';
  id: number;
  stage: WorkflowStageId;
  status: string;
  href: string;
  owner: string;
  blockedReason?: string;
};
export type WorkflowWaitingStep = {
  id:
    | 'period'
    | 'definition'
    | 'assignment'
    | 'target'
    | 'achievement'
    | 'manager_review'
    | 'hr_finalization';
  title: string;
  status: 'complete' | 'pending' | 'unavailable';
  owner: string;
  explanation: string;
  reminderKey?: string;
  reminderBlockedReason?: string;
  reminderStatus?: 'none' | 'active' | 'closed_unresolved' | 'no_recipient';
};
// Descriptive map of existing service transitions. Domain services remain authoritative.
export const KPI_DOMAIN_TRANSITIONS = {
  definition: {
    draft: ['published'],
    published: ['draft_revision', 'archived'],
    draft_revision: ['published'],
    archived: [],
  },
  assignment: { active: ['inactive'], inactive: [] },
  scorecard: {
    draft: ['published'],
    published: ['active', 'draft_revision', 'archived'],
    active: ['draft_revision', 'archived'],
    archived: [],
  },
  achievement: {
    draft: ['submitted'],
    submitted: ['under_review', 'approved', 'returned', 'rejected'],
    under_review: ['approved', 'returned', 'rejected'],
    returned: ['draft'],
    rejected: ['draft'],
    approved: ['superseded'],
    superseded: [],
  },
  cycle: {
    draft: ['open'],
    open: ['in_progress', 'closed'],
    in_progress: ['review', 'closed'],
    review: ['closed'],
    closed: [],
  },
  evaluation: {
    self_draft: ['self_submitted'],
    self_returned: ['self_submitted'],
    self_submitted: ['manager_draft', 'self_returned'],
    manager_draft: ['manager_submitted', 'self_returned'],
    manager_submitted: ['hr_reviewed', 'approved', 'manager_draft'],
    hr_reviewed: ['approved', 'manager_draft'],
    approved: ['finalized'],
    finalized: [],
    cancelled: [],
  },
  acknowledgement: {
    pending: ['acknowledged', 'disputed'],
    acknowledged: [],
    disputed: [],
  },
} as const;

@Injectable()
export class KpiWorkflowService {
  constructor(
    private readonly kpis: KpiService,
    private readonly scorecards: ScorecardService,
    private readonly achievements: AchievementService,
    private readonly evaluations: EvaluationService,
    @InjectRepository(KpiPeriod)
    private readonly periodRepository: Repository<KpiPeriod>,
    @InjectRepository(KpiDefinitionVersion)
    private readonly versionRepository: Repository<KpiDefinitionVersion>,
    @InjectRepository(CompanyUser)
    private readonly membershipRepository: Repository<CompanyUser>,
    private readonly notifications: NotificationsService,
    private readonly dataSource: DataSource,
    @InjectRepository(ActionItem)
    private readonly actionItemRepository: Repository<ActionItem>,
    private readonly actionItems: ActionItemsService,
  ) {}

  private issueKey(
    companyId: number,
    employeeId: number,
    reminderKey: string,
  ): string {
    if (reminderKey === 'period' || reminderKey === 'definition')
      return `kpi-workflow:${companyId}:company:${reminderKey}`;
    if (reminderKey === 'assignment')
      return `kpi-workflow:${companyId}:employee:${employeeId}:assignment`;
    if (reminderKey.startsWith('hr_finalization:'))
      return `kpi-workflow:${companyId}:evaluation:${reminderKey.split(':')[1]}:finalization`;
    throw new ConflictException('Unsupported reminder activity');
  }

  async resolveIssue(
    companyId: number,
    reminderKey: string,
    employeeId = 0,
  ): Promise<void> {
    await this.actionItems.completeBySource(
      companyId,
      this.issueKey(companyId, employeeId, reminderKey),
    );
  }

  private async reminderStates(
    actor: AuthenticatedUser,
    steps: WorkflowWaitingStep[],
  ): Promise<WorkflowWaitingStep[]> {
    const pending = steps.filter(
      (step) => !!step.reminderKey && step.status === 'pending',
    );
    if (!pending.length) return steps;
    const keys = pending.map((step) =>
      this.issueKey(actor.companyId!, actor.employeeId!, step.reminderKey!),
    );
    const items = await this.actionItemRepository.find({
      where: { companyId: actor.companyId!, sourceKey: In(keys) },
      select: { sourceKey: true, status: true },
    });
    const needsRecipient = pending.some(
      (step) =>
        !items.some(
          (row) =>
            row.sourceKey ===
            this.issueKey(
              actor.companyId!,
              actor.employeeId!,
              step.reminderKey!,
            ),
        ),
    );
    const recipient = needsRecipient
      ? await this.membershipRepository
          .createQueryBuilder('membership')
          .innerJoin('membership.role_assignments', 'assignment')
          .innerJoin('assignment.role', 'role')
          .where('membership.company_id = :companyId', {
            companyId: actor.companyId,
          })
          .andWhere('membership.status = :status', { status: 'active' })
          .andWhere('role.name IN (:...roles)', {
            roles: ['HR_MANAGER', 'COMPANY_ADMIN'],
          })
          .andWhere(
            '(role.company_id = :companyId OR role.company_id IS NULL)',
            { companyId: actor.companyId },
          )
          .andWhere('membership.id != :senderId', {
            senderId: actor.companyMembershipId ?? 0,
          })
          .getOne()
      : true;
    return steps.map((step) => {
      if (!step.reminderKey || step.status !== 'pending') return step;
      const item = items.find(
        (row) =>
          row.sourceKey ===
          this.issueKey(actor.companyId!, actor.employeeId!, step.reminderKey!),
      );
      if (!item)
        return recipient
          ? { ...step, reminderStatus: 'none' }
          : {
              ...step,
              reminderStatus: 'no_recipient',
              reminderBlockedReason:
                'No authorized HR recipient is configured. Please contact HR directly.',
            };
      return item.status === ActionItemStatusEnum.OPEN
        ? {
            ...step,
            reminderStatus: 'active',
            reminderBlockedReason:
              'HR has already been notified about this pending activity.',
          }
        : {
            ...step,
            reminderStatus: 'closed_unresolved',
            reminderBlockedReason:
              'The previous reminder was closed, but this step is still pending. Please contact HR; an escalation policy is not configured.',
          };
    });
  }

  private async personalSteps(
    actor: AuthenticatedUser,
    assignments: Awaited<ReturnType<KpiService['personalAssignments']>>,
    submissions: Awaited<ReturnType<AchievementService['mine']>>,
    evaluations: Awaited<ReturnType<EvaluationService['list']>>,
  ): Promise<WorkflowWaitingStep[]> {
    const companyId = actor.companyId!;
    const hasAssignment = assignments.some((row) => row.status === 'active');
    const [hasPeriod, hasDefinition] = hasAssignment
      ? [true, true]
      : await Promise.all([
          this.periodRepository.exist({ where: { companyId } }),
          this.versionRepository
            .createQueryBuilder('version')
            .innerJoin(
              KpiDefinition,
              'definition',
              'definition.id = version.definitionId',
            )
            .where('version.companyId = :companyId', { companyId })
            .andWhere('definition.companyId = :companyId', { companyId })
            .andWhere('definition.status = :status', { status: 'published' })
            .andWhere('version.publishedAt IS NOT NULL')
            .getExists(),
        ]);
    const ready = assignments.filter(
      (row) => row.status === 'active' && !!row.currentTarget,
    );
    const pendingReview = submissions.some((row) =>
      ['submitted', 'under_review'].includes(row.current?.status ?? ''),
    );
    const hrFinalization = evaluations.find(
      (row) => row.employeeId === actor.employeeId && row.status === 'approved',
    );
    return [
      {
        id: 'period',
        title: 'Reporting period',
        status: hasPeriod ? 'complete' : 'pending',
        owner: 'HR',
        explanation: hasPeriod
          ? 'A reporting period is configured.'
          : 'HR must configure a reporting period.',
        ...(!hasPeriod ? { reminderKey: 'period' } : {}),
      },
      {
        id: 'definition',
        title: 'Published KPI definition',
        status: hasDefinition ? 'complete' : 'pending',
        owner: 'HR',
        explanation: hasDefinition
          ? 'A published KPI definition is available.'
          : 'HR must publish an eligible KPI definition.',
        ...(!hasDefinition ? { reminderKey: 'definition' } : {}),
      },
      {
        id: 'assignment',
        title: 'Your KPI assignment',
        status: hasAssignment
          ? 'complete'
          : hasPeriod && hasDefinition
            ? 'pending'
            : 'unavailable',
        owner: 'HR or authorized manager',
        explanation: hasAssignment
          ? 'An active assignment is available.'
          : hasPeriod && hasDefinition
            ? 'An authorized HR user or manager must assign a KPI to you.'
            : 'Assignment can follow publication and period setup.',
        ...(!hasAssignment && hasPeriod && hasDefinition
          ? { reminderKey: 'assignment' }
          : {}),
      },
      {
        id: 'target',
        title: 'Assignment target',
        status: ready.length
          ? 'complete'
          : hasAssignment
            ? 'pending'
            : 'unavailable',
        owner: 'HR or authorized manager',
        explanation: ready.length
          ? 'At least one active assignment has a target.'
          : hasAssignment
            ? 'An authorized manager must configure a target before submission.'
            : 'A target is set on an assignment.',
      },
      {
        id: 'achievement',
        title: 'Achievement submission',
        status: submissions.some((row) =>
          ['submitted', 'under_review', 'approved'].includes(
            row.current?.status ?? '',
          ),
        )
          ? 'complete'
          : ready.length
            ? 'pending'
            : 'unavailable',
        owner: 'Employee',
        explanation: ready.length
          ? 'Submit an actual value for an assigned KPI.'
          : 'Submission becomes available after your assignment has a target.',
      },
      {
        id: 'manager_review',
        title: 'Manager review',
        status: submissions.some((row) => row.current?.status === 'approved')
          ? 'complete'
          : pendingReview
            ? 'pending'
            : 'unavailable',
        owner: 'Authorized manager',
        explanation: pendingReview
          ? 'Pending Manager Review.'
          : 'A submitted achievement needs manager approval.',
      },
      ...(hrFinalization
        ? [
            {
              id: 'hr_finalization' as const,
              title: 'HR finalization',
              status: 'pending' as const,
              owner: 'Authorized HR reviewer',
              explanation: 'Pending HR Finalization.',
              reminderKey: `hr_finalization:${hrFinalization.id}`,
            },
          ]
        : []),
    ];
  }

  async remindHr(actor: AuthenticatedUser, reminderKey: string) {
    if (
      !actor.companyId ||
      !actor.companyMembershipId ||
      !actor.employeeId ||
      !actor.roles.includes('EMPLOYEE')
    )
      throw new ForbiddenException('An employee company session is required');
    const assignments = await this.kpis.personalAssignments(actor);
    const [submissions, evaluations] = await Promise.all([
      this.achievements.mine(actor),
      this.evaluations.list(actor),
    ]);
    const step = (
      await this.personalSteps(actor, assignments, submissions, evaluations)
    ).find(
      (item) => item.reminderKey === reminderKey && item.status === 'pending',
    );
    if (!step)
      throw new ConflictException(
        'This HR step is no longer pending. Refresh your workflow status.',
      );
    const companyId = actor.companyId;
    const issueKey = this.issueKey(companyId, actor.employeeId, reminderKey);
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        issueKey,
      ]);
      // Recheck under the issue lock: another employee may have reported it first.
      const currentSteps = await this.personalSteps(
        actor,
        await this.kpis.personalAssignments(actor),
        await this.achievements.mine(actor),
        await this.evaluations.list(actor),
      );
      if (
        !currentSteps.some(
          (item) =>
            item.reminderKey === reminderKey && item.status === 'pending',
        )
      )
        throw new ConflictException(
          'This HR step is no longer pending. Refresh your workflow status.',
        );
      const existing = await this.actionItemRepository.findOne({
        where: { companyId, sourceKey: issueKey },
      });
      if (existing)
        return {
          message:
            existing.status === ActionItemStatusEnum.OPEN
              ? 'HR has already been notified about this activity.'
              : 'The previous reminder was closed. Please contact HR; an escalation policy is not configured.',
          reminderStatus:
            existing.status === ActionItemStatusEnum.OPEN
              ? 'active'
              : 'closed_unresolved',
          actionItemId: existing.id,
        };
      const assignedReviewerId = reminderKey.startsWith('hr_finalization:')
        ? evaluations.find(
            (row) =>
              row.id === Number(reminderKey.split(':')[1]) &&
              row.employeeId === actor.employeeId,
          )?.hrReviewerCompanyUserId
        : null;
      const recipientQuery = this.membershipRepository
        .createQueryBuilder('membership')
        .innerJoin('membership.role_assignments', 'assignment')
        .innerJoin('assignment.role', 'role')
        .where('membership.company_id = :companyId', { companyId })
        .andWhere('membership.status = :status', { status: 'active' })
        .andWhere('role.name IN (:...roles)', {
          roles: ['HR_MANAGER', 'COMPANY_ADMIN'],
        })
        .andWhere('(role.company_id = :companyId OR role.company_id IS NULL)', {
          companyId,
        })
        .andWhere('membership.id != :senderId', {
          senderId: actor.companyMembershipId,
        })
        .orderBy("CASE WHEN role.name = 'HR_MANAGER' THEN 0 ELSE 1 END", 'ASC')
        .addOrderBy('membership.id', 'ASC');
      if (assignedReviewerId)
        recipientQuery.andWhere('membership.id = :reviewerId', {
          reviewerId: assignedReviewerId,
        });
      const recipient = await recipientQuery.getOne();
      if (!recipient)
        throw new NotFoundException(
          'No authorized HR recipient is configured for your company. Please contact HR directly.',
        );
      const actionUrl =
        reminderKey === 'period'
          ? '/dashboard/kpi/periods'
          : reminderKey === 'definition'
            ? '/dashboard/kpi'
            : reminderKey === 'assignment'
              ? '/dashboard/kpi/assignments'
              : `/dashboard/kpi/evaluations/${reminderKey.split(':')[1]}`;
      const shared = reminderKey === 'period' || reminderKey === 'definition';
      const title = shared
        ? `KPI ${step.title.toLowerCase()} requires HR setup`
        : `KPI ${step.title.toLowerCase()} requires HR action`;
      const task = await this.actionItems.upsertOpen(
        {
          companyId,
          assigneeCompanyUserId: recipient.id,
          actionType: ActionItemTypeEnum.REMINDER,
          sourceModule: 'kpi',
          sourceEntityType: shared
            ? 'company'
            : reminderKey === 'assignment'
              ? 'employee'
              : 'evaluation',
          sourceEntityId: shared
            ? companyId
            : reminderKey === 'assignment'
              ? actor.employeeId!
              : reminderKey.split(':')[1],
          sourceKey: issueKey,
          title,
          description: shared
            ? `KPI ${step.title.toLowerCase()} is pending for this company. Resolve the setup in the linked HR workflow.`
            : `${step.title} is pending. Resolve it in the linked HR workflow.`,
          actionUrl,
          metadata: {
            pendingStep: step.id,
            scope: shared
              ? 'company'
              : reminderKey === 'assignment'
                ? 'employee'
                : 'evaluation',
          },
        },
        { reopenCompleted: false, reopenCancelled: false },
      );
      try {
        const notification = await this.notifications.createAndPush({
          company_id: companyId,
          receiver_company_user_id: recipient.id,
          category: NotificationCategoryEnum.HR,
          channels: [NotificationChannelEnum.IN_APP],
          is_mandatory: true,
          title,
          message: shared
            ? `Action required: ${step.title.toLowerCase()} for this company. Resolve the pending setup using the linked workflow.`
            : `${step.title} is pending. Open the linked HR workflow to resolve it.`,
          related_module: 'kpi',
          entity_type: 'kpi_workflow_issue',
          entity_id: issueKey,
          action_url: actionUrl,
          metadata: {
            issueKey,
            pendingStep: step.id,
            scope: shared ? 'company' : 'record',
          },
          dedupe_key: issueKey,
        });
        if (!notification) throw new Error('Notification was not recorded');
        return {
          message: 'Reminder sent to HR.',
          reminderStatus: 'active',
          actionItemId: task.id,
          notificationId: notification.id,
          channel: 'in_app',
        };
      } catch {
        await this.actionItems.cancelBySource(companyId, issueKey);
        throw new ConflictException(
          'The HR reminder could not be recorded. Please contact HR directly.',
        );
      }
    });
  }

  async guidance(actor: AuthenticatedUser) {
    const roles = actor.roles;
    const hr = roles.includes('COMPANY_ADMIN') || roles.includes('HR_MANAGER');
    const manager =
      hr ||
      roles.includes('DEPARTMENT_MANAGER') ||
      roles.includes('BRANCH_MANAGER');
    const employee = roles.includes('EMPLOYEE') && !!actor.employeeId;
    const management = roles.includes('MANAGEMENT');
    const actions: WorkflowAction[] = [];
    const records: WorkflowRecord[] = [];
    let waiting: WorkflowWaitingStep[] = [];
    const add = (action: WorkflowAction) => actions.push(action);
    if (manager) {
      const [definitions, periods, assignments, cards] = await Promise.all([
        this.kpis.listDefinitions(actor),
        this.kpis.listPeriods(actor),
        this.kpis.listAssignments(actor),
        this.scorecards.list(actor),
      ]);
      if (hr) {
        if (!periods.length)
          add({
            id: 'create-period',
            stage: 'setup',
            title: 'Create a reporting period',
            description: 'Assignments and scorecards use a reporting period.',
            owner: 'HR',
            href: '/dashboard/kpi/periods',
          });
        if (!definitions.length)
          add({
            id: 'create-definition',
            stage: 'define',
            title: 'Create a KPI definition',
            description:
              'Definitions can be prepared independently of reporting periods.',
            owner: 'HR',
            href: '/dashboard/kpi/create',
          });
        for (const definition of definitions) {
          if (
            definition.status !== 'archived' &&
            (!!definition.draftVersion ||
              !definition.currentVersion?.publishedAt)
          )
            add({
              id: `publish-${definition.id}`,
              stage: 'define',
              title: `Finish KPI ${definition.code}`,
              description:
                'Publish the draft version before it can be assigned.',
              owner: 'HR',
              href: `/dashboard/kpi/definitions/${definition.id}`,
              recordId: definition.id,
            });
        }
      }
      const published = definitions.some(
        (row) =>
          row.status === 'published' && !!row.currentVersion?.publishedAt,
      );
      const publishedFrequencies = [
        ...new Set(
          definitions
            .filter(
              (row) =>
                row.status === 'published' &&
                !!row.currentVersion?.publishedAt &&
                !!row.currentVersion.frequency,
            )
            .map((row) => row.currentVersion.frequency.trim().toLowerCase()),
        ),
      ];
      const periodFrequencies = [
        ...new Set(
          periods
            .map((period) => period.frequency.trim().toLowerCase())
            .filter(Boolean),
        ),
      ];
      const matchingPeriod = publishedFrequencies.some((frequency) =>
        periodFrequencies.includes(frequency),
      );
      for (const definition of definitions) {
        const assigned = assignments.some(
          (assignment) =>
            assignment.definitionVersion?.definitionId === definition.id,
        );
        records.push({
          kind: 'definition',
          id: definition.id,
          stage:
            definition.status === 'archived'
              ? 'close'
              : definition.draftVersion ||
                  !definition.currentVersion?.publishedAt
                ? 'define'
                : assigned
                  ? 'track'
                  : 'assign',
          status: definition.draftVersion
            ? 'draft_revision'
            : definition.status,
          href: `/dashboard/kpi/definitions/${definition.id}`,
          owner:
            definition.draftVersion || !definition.currentVersion?.publishedAt
              ? 'HR'
              : 'HR or authorized manager',
          blockedReason: !definition.currentVersion?.publishedAt
            ? 'Publish a valid draft before assignment.'
            : undefined,
        });
      }
      if (manager && !assignments.some((row) => row.status === 'active')) {
        const missing = !published
          ? 'A published KPI definition is required.'
          : !periods.length
            ? 'A KPI reporting period is required. Performance-module periods are separate.'
            : !matchingPeriod
              ? `Create a KPI reporting period matching a published KPI frequency (${publishedFrequencies.join(', ')}). Existing KPI reporting period frequencies: ${periodFrequencies.join(', ') || 'none'}. Performance-module periods are separate.`
              : undefined;
        add({
          id: 'create-assignment',
          stage: 'assign',
          title: missing ? 'Pending HR Setup' : 'Assign a KPI',
          description:
            missing ?? 'Select an authorized subject, period and target.',
          owner: missing ? 'HR' : 'HR or authorized manager',
          href: '/dashboard/kpi/assignments',
          blocked: !!missing,
          reason: missing,
          resolveHref: !hr
            ? undefined
            : !published
              ? '/dashboard/kpi'
              : '/dashboard/kpi/periods',
        });
      }
      for (const draft of manager
        ? cards.filter((row) => row.status === 'draft')
        : []) {
        add({
          id: `finish-scorecard-${draft.id}`,
          stage: 'track',
          title: `Finish scorecard ${draft.code}`,
          description: 'Review and publish its draft configuration when valid.',
          owner: 'HR or authorized manager',
          href: `/dashboard/kpi/scorecards/${draft.id}`,
          recordId: draft.id,
        });
      }
      if (manager && !cards.some((row) => row.status !== 'archived')) {
        const hasActiveAssignment = assignments.some(
          (row) => row.status === 'active',
        );
        add({
          id: 'create-scorecard',
          stage: 'track',
          title: 'Configure a scorecard',
          description:
            'Use eligible active assignments in the same scope and period.',
          owner: 'HR or authorized manager',
          href: '/dashboard/kpi/scorecards/new',
          blocked: !hasActiveAssignment,
          reason: !hasActiveAssignment
            ? 'Create an active KPI assignment with a target first.'
            : undefined,
          resolveHref: !hasActiveAssignment
            ? '/dashboard/kpi/assignments'
            : undefined,
        });
      }
      for (const card of cards)
        records.push({
          kind: 'scorecard',
          id: card.id,
          stage:
            card.status === 'archived'
              ? 'close'
              : card.status === 'draft'
                ? 'track'
                : card.performanceStatus === 'scored'
                  ? 'approve'
                  : 'submit',
          status: card.status,
          href: `/dashboard/kpi/scorecards/${card.id}`,
          owner:
            card.status === 'draft'
              ? 'HR or authorized manager'
              : 'Employee and reviewer',
          blockedReason:
            card.status === 'draft'
              ? 'Publish a valid scorecard configuration.'
              : card.performanceStatus !== 'scored'
                ? 'Approved achievement data is incomplete.'
                : undefined,
        });
      for (const assignment of assignments)
        records.push({
          kind: 'assignment',
          id: assignment.id,
          stage: assignment.status === 'inactive' ? 'close' : 'track',
          status: assignment.status,
          href: `/dashboard/kpi/targets?assignment=${assignment.id}`,
          owner: 'HR or authorized manager',
          blockedReason:
            assignment.status === 'active' && !assignment.currentTarget
              ? 'Configure an assignment target.'
              : undefined,
        });
      if (manager) {
        const pending = await this.achievements.pending(actor);
        for (const item of pending) {
          if (!item.current) continue;
          add({
            id: `review-${item.id}`,
            stage: 'review',
            title: `Review achievement #${item.id}`,
            description: `Submission ${item.current.status.replaceAll('_', ' ')}.`,
            owner: 'Authorized manager',
            href: `/dashboard/kpi/reviews/${item.id}`,
            recordId: item.id,
          });
          records.push({
            kind: 'achievement',
            id: item.id,
            stage: 'review',
            status: item.current.status,
            href: `/dashboard/kpi/reviews/${item.id}`,
            owner: 'Authorized manager',
          });
        }
      }
      if (hr) {
        const [cycles, templates] = await Promise.all([
          this.evaluations.cycles(actor),
          this.evaluations.templates(actor),
        ]);
        const hasTemplate = templates.some((row) =>
          row.versions.some((version) => !!version.publishedAt),
        );
        if (!cycles.length)
          add({
            id: 'create-cycle',
            stage: 'setup',
            title: 'Set up an evaluation cycle',
            description:
              'A published appraisal template and reporting period are required.',
            owner: 'HR',
            href: '/dashboard/kpi/evaluation-cycles',
            blocked: !periods.length || !hasTemplate,
            reason: !periods.length
              ? 'Create a reporting period first.'
              : !hasTemplate
                ? 'Publish an appraisal template first.'
                : undefined,
            resolveHref: !periods.length
              ? '/dashboard/kpi/periods'
              : !hasTemplate
                ? '/dashboard/kpi/evaluation-templates'
                : undefined,
          });
        for (const cycle of cycles.filter((row) => row.status === 'draft'))
          add({
            id: `open-cycle-${cycle.id}`,
            stage: 'setup',
            title: `Open evaluation cycle ${cycle.name}`,
            description:
              'Review its published template and reporting period before opening it.',
            owner: 'HR',
            href: '/dashboard/kpi/evaluation-cycles',
            recordId: cycle.id,
          });
      }
    }
    if (employee) {
      const [mine, submissions, personalCards] = await Promise.all([
        this.kpis.personalAssignments(actor),
        this.achievements.mine(actor),
        this.scorecards.mine(actor),
      ]);
      waiting = await this.personalSteps(
        actor,
        mine,
        submissions,
        await this.evaluations.list(actor),
      );
      waiting = await this.reminderStates(actor, waiting);
      const byAssignment = new Map(
        submissions.map((row) => [row.assignmentId, row]),
      );
      for (const assignment of mine) {
        if (assignment.status !== 'active') continue;
        const submission = byAssignment.get(assignment.id);
        const submissionStatus = submission?.current?.status;
        if (
          !submissionStatus ||
          ['draft', 'returned', 'rejected'].includes(submissionStatus)
        ) {
          const blocked = !assignment.currentTarget;
          add({
            id: `submit-${assignment.id}`,
            stage: 'submit',
            title:
              submissionStatus === 'returned'
                ? 'Correct a returned achievement'
                : submissionStatus === 'rejected'
                  ? 'Prepare a corrected achievement'
                  : 'Submit an achievement',
            description: blocked
              ? 'The assignment has no target configuration.'
              : `KPI assignment #${assignment.id}.`,
            owner: 'Employee',
            href: `/dashboard/me/kpi/${assignment.id}`,
            recordId: assignment.id,
            blocked,
            reason: blocked
              ? 'An authorized manager must configure the target.'
              : undefined,
          });
        }
        records.push({
          kind: 'assignment',
          id: assignment.id,
          stage:
            submissionStatus === 'approved'
              ? 'approve'
              : submissionStatus === 'submitted' ||
                  submissionStatus === 'under_review'
                ? 'review'
                : 'submit',
          status: submissionStatus ?? assignment.status,
          href: `/dashboard/me/kpi/${assignment.id}`,
          owner:
            submissionStatus === 'submitted' ||
            submissionStatus === 'under_review'
              ? 'Authorized manager'
              : 'Employee',
        });
      }
      for (const card of personalCards) {
        const existingIndex = records.findIndex(
          (record) => record.kind === 'scorecard' && record.id === card.id,
        );
        if (existingIndex >= 0) records.splice(existingIndex, 1);
        records.push({
          kind: 'scorecard',
          id: card.id,
          stage: card.performanceStatus === 'scored' ? 'approve' : 'submit',
          status: card.status,
          href: `/dashboard/me/scorecards/${card.id}`,
          owner:
            card.performanceStatus === 'scored'
              ? 'Employee'
              : 'Employee and reviewer',
          blockedReason:
            card.performanceStatus !== 'scored'
              ? 'Approved achievement data is incomplete.'
              : undefined,
        });
      }
    }
    if (hr || manager || employee) {
      const evaluations = await this.evaluations.list(actor);
      for (const row of evaluations) {
        const personal = actor.employeeId === row.employeeId;
        const reviewer =
          actor.employeeId === row.managerEmployeeId && !personal;
        const hrReviewer =
          hr &&
          !personal &&
          (roles.includes('COMPANY_ADMIN') ||
            !row.hrReviewerCompanyUserId ||
            row.hrReviewerCompanyUserId === actor.companyMembershipId);
        const href = personal
          ? `/dashboard/me/evaluations/${row.id}`
          : `/dashboard/kpi/evaluations/${row.id}`;
        if (personal && ['self_draft', 'self_returned'].includes(row.status))
          add({
            id: `self-${row.id}`,
            stage: 'submit',
            title:
              row.status === 'self_returned'
                ? 'Correct your self-assessment'
                : 'Complete your self-assessment',
            description: `Evaluation #${row.id}.`,
            owner: 'Employee',
            href,
            recordId: row.id,
          });
        if (
          reviewer &&
          ['self_submitted', 'manager_draft'].includes(row.status)
        )
          add({
            id: `manager-${row.id}`,
            stage: 'review',
            title: 'Complete a manager evaluation',
            description: `Evaluation #${row.id}.`,
            owner: 'Assigned manager',
            href,
            recordId: row.id,
          });
        if (
          hrReviewer &&
          ['manager_submitted', 'hr_reviewed', 'approved'].includes(row.status)
        ) {
          const scorecard =
            row.status === 'approved'
              ? await this.scorecards.get(actor, row.scorecardId)
              : null;
          const incomplete =
            !!scorecard &&
            (!scorecard.currentVersion?.publishedAt ||
              scorecard.overallScore === null ||
              scorecard.entries.some(
                (entry) => entry.required && entry.status !== 'scored',
              ));
          add({
            id: `hr-${row.id}`,
            stage: row.status === 'approved' ? 'close' : 'approve',
            title:
              row.status === 'approved'
                ? 'Finalize an approved evaluation'
                : 'Review an employee evaluation',
            description: `Evaluation #${row.id}. Finalization still requires complete approved KPI results.`,
            owner: 'Authorized HR reviewer',
            href,
            recordId: row.id,
            blocked: incomplete,
            reason: incomplete
              ? 'Finalization requires a published scorecard with all required approved KPI results.'
              : undefined,
            resolveHref: incomplete
              ? `/dashboard/kpi/scorecards/${row.scorecardId}`
              : undefined,
          });
        }
        if (personal && row.status === 'finalized' && !row.ackStatus)
          add({
            id: `ack-${row.id}`,
            stage: 'close',
            title: 'Acknowledge your finalized evaluation',
            description: 'Acknowledgement confirms receipt, not agreement.',
            owner: 'Employee',
            href,
            recordId: row.id,
          });
        records.push({
          kind: 'evaluation',
          id: row.id,
          stage:
            row.status === 'finalized'
              ? 'close'
              : row.status === 'approved'
                ? 'approve'
                : row.status.startsWith('manager') ||
                    row.status === 'hr_reviewed'
                  ? 'review'
                  : 'submit',
          status:
            row.ackStatus === 'disputed'
              ? 'disputed'
              : row.amendedFromId
                ? `amended_${row.status}`
                : row.status,
          href,
          owner: row.status.startsWith('self')
            ? 'Employee'
            : row.status === 'finalized'
              ? 'Employee'
              : row.status.startsWith('manager')
                ? 'Assigned manager'
                : 'Authorized HR reviewer',
        });
      }
    }
    if (management && !manager)
      add({
        id: 'view-analytics',
        stage: 'track',
        title: 'View aggregate KPI analytics',
        description:
          'Company-level results are shown only where disclosure rules permit.',
        owner: 'Management',
        href: '/dashboard/kpi/analytics',
      });
    return {
      stages: KPI_WORKFLOW_STAGES,
      domainTransitions: KPI_DOMAIN_TRANSITIONS,
      actions: actions.slice(0, 50),
      records: records.slice(0, 100),
      waiting,
      updatedAt: new Date().toISOString(),
    };
  }
}
