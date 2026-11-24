import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { FilesService } from '../../files/files.service';
import { NotificationCategoryEnum } from '../../notifications/enums/notification-category.enum';
import { NotificationChannelEnum } from '../../notifications/enums/notification-channel.enum';
import { NotificationTypeEnum } from '../../notifications/enums/notification-type.enum';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  HR_PRIVATE_DOCUMENT_MAX_BYTES,
  HR_PRIVATE_DOCUMENT_MIME_TYPES,
} from '../../files/file-policy';
import { createDownloadStream } from '../../files/file-download.util';
import { HrAccessService } from '../shared/hr-access.service';
import { Employee } from '../employees/entities/employee.entity';
import { ActionItemsService } from '../action-inbox/action-items.service';
import { ActionItemTypeEnum } from '../action-inbox/enums/action-item-type.enum';
import {
  KpiAssignment,
  KpiDefinitionVersion,
  KpiPeriod,
  KpiTargetRevision,
} from './kpi.entities';
import { KpiService } from './kpi.service';
import { ScorecardVersion, ScoringPolicyVersion } from './scorecard.entities';
import {
  AchievementActivityDto,
  AchievementActivityUpdateDto,
  AchievementDraftDto,
  AchievementReviewDto,
  AchievementUpdateDto,
  EvidenceUploadDto,
} from './dto/achievement.dto';
import {
  KpiAchievementActivity,
  KpiAchievementActivityEvidence,
  KpiAchievement,
  KpiAchievementEvent,
  KpiAchievementEvidence,
  KpiAchievementRevision,
  KpiEvidenceRule,
} from './achievement.entities';
import { validateActual } from './achievement-validation';

const managers = [
  'COMPANY_ADMIN',
  'HR_MANAGER',
  'DEPARTMENT_MANAGER',
  'BRANCH_MANAGER',
];
const administrators = ['COMPANY_ADMIN', 'HR_MANAGER'];

@Injectable()
export class AchievementService {
  private readonly logger = new Logger(AchievementService.name);
  constructor(
    private readonly db: DataSource,
    @InjectRepository(KpiAchievement)
    private readonly achievements: Repository<KpiAchievement>,
    @InjectRepository(KpiAchievementRevision)
    private readonly revisions: Repository<KpiAchievementRevision>,
    @InjectRepository(KpiAchievementEvidence)
    private readonly evidence: Repository<KpiAchievementEvidence>,
    @InjectRepository(KpiAchievementEvent)
    private readonly events: Repository<KpiAchievementEvent>,
    @InjectRepository(KpiAchievementActivity)
    private readonly activities: Repository<KpiAchievementActivity>,
    @InjectRepository(KpiAchievementActivityEvidence)
    private readonly activityEvidence: Repository<KpiAchievementActivityEvidence>,
    @InjectRepository(KpiEvidenceRule)
    private readonly rules: Repository<KpiEvidenceRule>,
    @InjectRepository(KpiAssignment)
    private readonly assignments: Repository<KpiAssignment>,
    @InjectRepository(KpiDefinitionVersion)
    private readonly definitions: Repository<KpiDefinitionVersion>,
    @InjectRepository(KpiTargetRevision)
    private readonly targets: Repository<KpiTargetRevision>,
    @InjectRepository(ScorecardVersion)
    private readonly scorecardVersions: Repository<ScorecardVersion>,
    @InjectRepository(ScoringPolicyVersion)
    private readonly policies: Repository<ScoringPolicyVersion>,
    private readonly kpi: KpiService,
    private readonly access: HrAccessService,
    private readonly files: FilesService,
    private readonly inbox: ActionItemsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async achievementNotification(
    root: KpiAchievement,
    assignment: KpiAssignment,
    recipient: 'manager' | 'employee',
    type: NotificationTypeEnum,
    event: string,
    title: string,
    message: string,
    rowVersion: number,
  ) {
    try {
      const employeeId =
        recipient === 'manager'
          ? (assignment.managerEmployeeId ??
            Number(assignment.organizationSnapshot?.managerEmployeeId))
          : assignment.subjectType === 'employee'
            ? assignment.subjectId
            : null;
      if (!Number.isInteger(employeeId) || Number(employeeId) < 1) return;
      const employee = await this.db.getRepository(Employee).findOneBy({
        id: Number(employeeId),
        company_id: root.companyId,
      });
      if (!employee?.company_user_id) return;
      await this.notifications.createAndPush({
        company_id: root.companyId,
        receiver_company_user_id: employee.company_user_id,
        type,
        category: NotificationCategoryEnum.HR,
        title,
        message,
        related_module: 'kpi',
        entity_type: 'achievement',
        entity_id: root.id,
        action_url:
          recipient === 'manager'
            ? `/dashboard/kpi/reviews/${root.id}`
            : `/dashboard/me/kpi/${assignment.id}`,
        event_key: `kpi.achievement.${event}`,
        dedupe_key: `kpi:achievement:${root.id}:${event}:${rowVersion}:${employee.company_user_id}`,
        channels: [NotificationChannelEnum.IN_APP],
      });
    } catch (error) {
      // The workflow transition has already committed. Notification failure
      // must not make the caller retry a successful review action.
      this.logger.warn(
        `KPI achievement ${root.id} ${event} notification failed: ${(error as Error).message}`,
      );
    }
  }

  private async queueReview(root: KpiAchievement, assignment: KpiAssignment) {
    const managerId =
      assignment.managerEmployeeId ??
      Number(assignment.organizationSnapshot?.managerEmployeeId);
    if (!Number.isInteger(managerId) || managerId < 1) return;
    try {
      const employee = await this.db
        .getRepository(Employee)
        .findOneBy({ id: managerId, company_id: root.companyId });
      if (!employee?.company_user_id) return;
      await this.inbox.upsertOpen({
        companyId: root.companyId,
        assigneeCompanyUserId: employee.company_user_id,
        assigneeEmployeeId: managerId,
        actionType: ActionItemTypeEnum.APPROVAL,
        sourceModule: 'kpi',
        sourceEntityType: 'achievement',
        sourceEntityId: root.id,
        sourceKey: `kpi:achievement:review:${root.id}`,
        title: 'Review KPI achievement',
        description: `KPI assignment #${assignment.id} is awaiting review`,
        branchId: Number(assignment.organizationSnapshot?.branchId) || null,
        departmentId:
          Number(assignment.organizationSnapshot?.departmentId) || null,
        actionUrl: `/dashboard/kpi/reviews/${root.id}`,
      });
    } catch (error) {
      this.logger.warn(
        `Unable to queue KPI review action item ${root.id}: ${(error as Error).message}`,
      );
    }
  }
  private async completeReview(root: KpiAchievement) {
    try {
      await this.inbox.completeAllOpenForEntity(
        root.companyId,
        'kpi',
        'achievement',
        root.id,
      );
    } catch (error) {
      this.logger.warn(
        `Unable to complete KPI review action item ${root.id}: ${(error as Error).message}`,
      );
    }
  }

  private company(actor: AuthenticatedUser) {
    return this.access.ensureActorCompanyId(actor);
  }
  private isManager(actor: AuthenticatedUser) {
    return actor.roles.some((role) => managers.includes(role));
  }
  private isAdmin(actor: AuthenticatedUser) {
    return (
      actor.roles.some((role) => administrators.includes(role)) &&
      this.access.hasCompanyScope(actor)
    );
  }
  private personal(actor: AuthenticatedUser, assignment: KpiAssignment) {
    return (
      assignment.subjectType === 'employee' &&
      !!actor.employeeId &&
      assignment.subjectId === actor.employeeId
    );
  }
  private async assignment(
    actor: AuthenticatedUser,
    id: number,
    managerOnly = false,
  ) {
    const row = await this.assignments.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!row) throw new NotFoundException('KPI assignment not found');
    if (managerOnly || !this.personal(actor, row)) {
      if (!this.isManager(actor))
        throw new ForbiddenException('KPI achievement access denied');
      await this.kpi.getAssignment(actor, id);
    }
    return row;
  }
  private async editable(actor: AuthenticatedUser, assignment: KpiAssignment) {
    if (this.personal(actor, assignment)) return;
    if (assignment.subjectType === 'employee')
      throw new ForbiddenException(
        'Only the assigned employee may submit a personal KPI',
      );
    if (!this.isManager(actor))
      throw new ForbiddenException('KPI achievement access denied');
    await this.kpi.getAssignment(actor, assignment.id);
  }
  private activityWriter(actor: AuthenticatedUser, assignment: KpiAssignment) {
    if (!this.personal(actor, assignment))
      throw new ForbiddenException(
        'Only the assigned employee may change activity records',
      );
  }
  private validateActivityInput(
    input: AchievementActivityDto,
    period: KpiPeriod,
  ) {
    const activityDate = input.activityDate.slice(0, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(activityDate) ||
      Number.isNaN(Date.parse(`${activityDate}T00:00:00Z`))
    )
      throw new BadRequestException('Enter a valid activity date');
    if (activityDate < period.startDate || activityDate > period.endDate)
      throw new BadRequestException(
        'Activity date must be within the assigned reporting period',
      );
    if (!input.title.trim() || !input.details.trim())
      throw new BadRequestException('Activity title and details are required');
    const result = input.measurableResult;
    if (result !== undefined && result !== null) {
      if (typeof result === 'number' && !Number.isFinite(result))
        throw new BadRequestException('Activity result must be finite');
      if (typeof result === 'string' && result.length > 250)
        throw new BadRequestException('Activity result is too long');
      if (typeof result === 'object') {
        const row = result as Record<string, unknown>;
        const completed = row.completed;
        const eligible = row.eligible;
        if (
          Array.isArray(result) ||
          Object.keys(row).some(
            (key) => !['completed', 'eligible'].includes(key),
          ) ||
          typeof completed !== 'number' ||
          typeof eligible !== 'number' ||
          !Number.isFinite(completed) ||
          !Number.isFinite(eligible) ||
          completed < 0 ||
          eligible <= 0 ||
          completed > eligible
        )
          throw new BadRequestException(
            'Use a finite result or completed/eligible quantities with completed no greater than eligible',
          );
      }
    }
    return activityDate;
  }
  private async periodFor(assignment: KpiAssignment) {
    return this.db.getRepository(KpiPeriod).findOneByOrFail({
      id: assignment.periodId,
      companyId: assignment.companyId,
    });
  }
  private async bumpRevisionForActivity(
    manager: import('typeorm').EntityManager,
    revisionId: number,
    companyId: number,
  ) {
    const revision = await manager.findOne(KpiAchievementRevision, {
      where: { id: revisionId, companyId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!revision || revision.status !== 'draft')
      throw new ConflictException('Activities can only change in a draft');
    revision.rowVersion++;
    await manager.save(revision);
    return revision;
  }
  private async carryForwardActivities(
    manager: import('typeorm').EntityManager,
    root: KpiAchievement,
    fromRevisionId: number,
    toRevision: KpiAchievementRevision,
    assignment: KpiAssignment,
    actor: AuthenticatedUser,
  ) {
    const prior = await manager.find(KpiAchievementActivity, {
      where: { companyId: root.companyId, revisionId: fromRevisionId },
      order: { id: 'ASC' },
    });
    for (const item of prior) {
      const copy = await manager.save(
        KpiAchievementActivity,
        manager.create(KpiAchievementActivity, {
          companyId: root.companyId,
          assignmentId: assignment.id,
          revisionId: toRevision.id,
          employeeId: item.employeeId,
          periodId: item.periodId,
          activityDate: item.activityDate,
          title: item.title,
          details: item.details,
          measurableResult: item.measurableResult,
          comments: item.comments,
          createdBy: actor.id,
          rowVersion: 1,
        }),
      );
      const files = await manager
        .getRepository(KpiAchievementActivityEvidence)
        .createQueryBuilder('file')
        .addSelect('file.privatePath')
        .where(
          'file.companyId = :companyId AND file.activityId = :activityId',
          {
            companyId: root.companyId,
            activityId: item.id,
          },
        )
        .getMany();
      for (const file of files) {
        await manager.save(
          KpiAchievementActivityEvidence,
          manager.create(KpiAchievementActivityEvidence, {
            companyId: file.companyId,
            activityId: copy.id,
            privatePath: file.privatePath,
            fileName: file.fileName,
            mimeType: file.mimeType,
            fileSize: file.fileSize,
            uploadedBy: file.uploadedBy,
          }),
        );
      }
    }
  }
  private async reviewable(
    actor: AuthenticatedUser,
    assignment: KpiAssignment,
    revision: KpiAchievementRevision,
  ) {
    if (!this.isManager(actor))
      throw new ForbiddenException('Manager role required');
    await this.kpi.getAssignment(actor, assignment.id);
    if (
      actor.id === revision.submittedBy ||
      (actor.employeeId &&
        actor.employeeId === assignment.subjectId &&
        assignment.subjectType === 'employee')
    )
      throw new ForbiddenException('Self-approval is not permitted');
    if (
      !this.isAdmin(actor) &&
      (!assignment.managerEmployeeId ||
        actor.employeeId !== assignment.managerEmployeeId)
    )
      throw new ForbiddenException('Responsible manager review required');
  }
  private async rubric(
    companyId: number,
    assignmentId: number,
  ): Promise<string[]> {
    const versions = await this.scorecardVersions.find({
      where: { companyId, publishedAt: Not(IsNull()) },
    });
    const ids = versions
      .filter((version) =>
        version.entries.some((entry) => entry.assignmentId === assignmentId),
      )
      .map((version) => version.policyVersionId)
      .filter((id): id is number => id !== null);
    if (!ids.length) return [];
    const policies = await this.policies.findBy({ companyId, id: In(ids) });
    return [
      ...new Set(
        policies.flatMap((policy) =>
          (
            (policy.config as { qualitativeRubric?: Array<{ label: string }> })
              .qualitativeRubric ?? []
          ).map((item) => item.label),
        ),
      ),
    ];
  }
  private async validate(companyId: number, revision: KpiAchievementRevision) {
    const definition = await this.definitions.findOneBy({
      id: revision.definitionVersionId,
      companyId,
    });
    if (!definition?.publishedAt)
      throw new ConflictException(
        'Published KPI definition version is required',
      );
    const achievement = await this.achievements.findOneByOrFail({
      id: revision.achievementId,
      companyId,
    });
    validateActual(
      definition.measurementType,
      revision.actual,
      definition.measurementType === 'qualitative'
        ? await this.rubric(companyId, achievement.assignmentId)
        : [],
    );
  }
  private async event(
    manager: import('typeorm').EntityManager,
    actor: AuthenticatedUser,
    root: KpiAchievement,
    revision: KpiAchievementRevision,
    action: string,
    details: Record<string, unknown> = {},
  ) {
    await manager.save(
      KpiAchievementEvent,
      manager.create(KpiAchievementEvent, {
        companyId: root.companyId,
        achievementId: root.id,
        revisionId: revision.id,
        action,
        actorId: actor.id,
        details,
      }),
    );
  }
  private async rootAndRevision(actor: AuthenticatedUser, id: number) {
    const root = await this.achievements.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!root) throw new NotFoundException('Achievement not found');
    const assignment = await this.assignment(actor, root.assignmentId);
    if (!root.latestRevisionId)
      throw new ConflictException('Achievement revision missing');
    const revision = await this.revisions.findOneByOrFail({
      id: root.latestRevisionId,
      companyId: root.companyId,
      achievementId: id,
    });
    return { root, revision, assignment };
  }
  private async detail(actor: AuthenticatedUser, root: KpiAchievement) {
    const assignment = await this.assignment(actor, root.assignmentId);
    const decoratedAssignment = this.personal(actor, assignment)
      ? (await this.kpi.personalAssignments(actor)).find(
          (row) => row.id === assignment.id,
        )
      : await this.kpi.getAssignment(actor, assignment.id);
    const revisions = await this.revisions.find({
      where: { companyId: root.companyId, achievementId: root.id },
      order: { revision: 'DESC' },
    });
    const evidence = revisions.length
      ? await this.evidence.findBy({
          companyId: root.companyId,
          revisionId: In(revisions.map((revision) => revision.id)),
        })
      : [];
    const activities = revisions.length
      ? await this.activities.find({
          where: {
            companyId: root.companyId,
            revisionId: In(revisions.map((revision) => revision.id)),
          },
          order: { activityDate: 'DESC', id: 'DESC' },
        })
      : [];
    const activityEvidence = activities.length
      ? await this.activityEvidence.findBy({
          companyId: root.companyId,
          activityId: In(activities.map((activity) => activity.id)),
        })
      : [];
    const activitiesFor = (revisionId: number) =>
      activities
        .filter((activity) => activity.revisionId === revisionId)
        .map((activity) => ({
          ...activity,
          status:
            revisions.find((revision) => revision.id === revisionId)?.status ??
            'draft',
          evidence: activityEvidence.filter(
            (file) => file.activityId === activity.id,
          ),
        }));
    const history = await this.events.find({
      where: { companyId: root.companyId, achievementId: root.id },
      order: { id: 'ASC' },
    });
    return {
      ...root,
      assignment: decoratedAssignment ?? assignment,
      current: revisions[0]
        ? {
            ...revisions[0],
            evidence: evidence.filter(
              (file) => file.revisionId === revisions[0].id,
            ),
            activities: activitiesFor(revisions[0].id),
          }
        : null,
      revisions: revisions.map((revision) => ({
        ...revision,
        evidence: evidence.filter((file) => file.revisionId === revision.id),
        activities: activitiesFor(revision.id),
        effectiveStatus:
          revision.status === 'approved' &&
          root.approvedRevisionId !== revision.id
            ? 'superseded'
            : revision.status,
      })),
      history,
    };
  }
  async get(actor: AuthenticatedUser, id: number) {
    const root = await this.achievements.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!root) throw new NotFoundException('Achievement not found');
    return this.detail(actor, root);
  }
  async addActivity(
    actor: AuthenticatedUser,
    achievementId: number,
    input: AchievementActivityDto,
  ) {
    const { root, revision, assignment } = await this.rootAndRevision(
      actor,
      achievementId,
    );
    this.activityWriter(actor, assignment);
    if (assignment.status !== 'active' || revision.status !== 'draft')
      throw new ConflictException(
        'Only an active assignment draft accepts activities',
      );
    const period = await this.periodFor(assignment);
    const activityDate = this.validateActivityInput(input, period);
    await this.db.transaction(async (manager) => {
      const current = await this.bumpRevisionForActivity(
        manager,
        revision.id,
        root.companyId,
      );
      const activity = await manager.save(
        KpiAchievementActivity,
        manager.create(KpiAchievementActivity, {
          companyId: root.companyId,
          assignmentId: assignment.id,
          revisionId: current.id,
          employeeId: assignment.subjectId,
          periodId: assignment.periodId,
          activityDate,
          title: input.title.trim(),
          details: input.details.trim(),
          measurableResult: input.measurableResult ?? null,
          comments: input.comments?.trim() || null,
          createdBy: actor.id,
          rowVersion: 1,
        }),
      );
      await this.event(manager, actor, root, current, 'activity_created', {
        activityId: activity.id,
        title: activity.title,
        activityDate: activity.activityDate,
      });
    });
    return this.get(actor, achievementId);
  }
  async updateActivity(
    actor: AuthenticatedUser,
    achievementId: number,
    activityId: number,
    input: AchievementActivityUpdateDto,
  ) {
    const { root, revision, assignment } = await this.rootAndRevision(
      actor,
      achievementId,
    );
    this.activityWriter(actor, assignment);
    const period = await this.periodFor(assignment);
    const activityDate = this.validateActivityInput(input, period);
    await this.db.transaction(async (manager) => {
      const current = await this.bumpRevisionForActivity(
        manager,
        revision.id,
        root.companyId,
      );
      const activity = await manager.findOne(KpiAchievementActivity, {
        where: {
          id: activityId,
          companyId: root.companyId,
          assignmentId: assignment.id,
          revisionId: revision.id,
          employeeId: actor.employeeId!,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!activity || activity.rowVersion !== input.rowVersion)
        throw new ConflictException('Activity changed; reload before editing');
      const before = {
        activityDate: activity.activityDate,
        title: activity.title,
        details: activity.details,
        measurableResult: activity.measurableResult,
        comments: activity.comments,
      };
      activity.activityDate = activityDate;
      activity.title = input.title.trim();
      activity.details = input.details.trim();
      activity.measurableResult = input.measurableResult ?? null;
      activity.comments = input.comments?.trim() || null;
      activity.rowVersion++;
      await manager.save(activity);
      await this.event(manager, actor, root, current, 'activity_updated', {
        activityId: activity.id,
        before,
        after: {
          activityDate: activity.activityDate,
          title: activity.title,
          details: activity.details,
          measurableResult: activity.measurableResult,
          comments: activity.comments,
        },
      });
    });
    return this.get(actor, achievementId);
  }
  async removeActivity(
    actor: AuthenticatedUser,
    achievementId: number,
    activityId: number,
    rowVersion: number,
  ) {
    const { root, revision, assignment } = await this.rootAndRevision(
      actor,
      achievementId,
    );
    this.activityWriter(actor, assignment);
    const removedFiles: string[] = [];
    await this.db.transaction(async (manager) => {
      const current = await this.bumpRevisionForActivity(
        manager,
        revision.id,
        root.companyId,
      );
      const activity = await manager.findOne(KpiAchievementActivity, {
        where: {
          id: activityId,
          companyId: root.companyId,
          assignmentId: assignment.id,
          revisionId: revision.id,
          employeeId: actor.employeeId!,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!activity || activity.rowVersion !== rowVersion)
        throw new ConflictException('Activity changed; reload before removing');
      const files = await manager
        .getRepository(KpiAchievementActivityEvidence)
        .createQueryBuilder('file')
        .addSelect('file.privatePath')
        .where(
          'file.companyId = :companyId AND file.activityId = :activityId',
          {
            companyId: root.companyId,
            activityId: activity.id,
          },
        )
        .getMany();
      removedFiles.push(...files.map((file) => file.privatePath));
      await this.event(manager, actor, root, current, 'activity_removed', {
        activityId: activity.id,
        activityDate: activity.activityDate,
        title: activity.title,
        details: activity.details,
        measurableResult: activity.measurableResult,
        comments: activity.comments,
        evidence: files.map(({ id, fileName, mimeType, fileSize }) => ({
          id,
          fileName,
          mimeType,
          fileSize,
        })),
      });
      await manager.remove(activity);
    });
    for (const path of new Set(removedFiles)) {
      const remaining = await this.activityEvidence
        .createQueryBuilder('file')
        .where('file.privatePath = :path', { path })
        .getCount();
      if (remaining === 0) await this.files.removeManagedFile(path);
    }
    return this.get(actor, achievementId);
  }
  async uploadActivityEvidence(
    actor: AuthenticatedUser,
    achievementId: number,
    activityId: number,
    dto: EvidenceUploadDto,
  ) {
    const { root, revision, assignment } = await this.rootAndRevision(
      actor,
      achievementId,
    );
    this.activityWriter(actor, assignment);
    if (revision.status !== 'draft')
      throw new ConflictException('Only a draft accepts activity evidence');
    const activity = await this.activities.findOneBy({
      id: activityId,
      companyId: root.companyId,
      assignmentId: assignment.id,
      revisionId: revision.id,
      employeeId: actor.employeeId!,
    });
    if (!activity || activity.rowVersion !== dto.rowVersion)
      throw new ConflictException(
        'Activity changed; reload before attaching evidence',
      );
    const file = await this.files.savePrivateBase64File(dto.file, {
      directorySegments: [
        'kpi-achievement-activities',
        String(root.companyId),
        String(root.id),
        String(revision.id),
        String(activity.id),
      ],
      allowedMimeTypes: [...HR_PRIVATE_DOCUMENT_MIME_TYPES],
      maxFileSizeBytes: HR_PRIVATE_DOCUMENT_MAX_BYTES,
      validateFileSignature: true,
    });
    try {
      await this.db.transaction(async (manager) => {
        const currentRevision = await this.bumpRevisionForActivity(
          manager,
          revision.id,
          root.companyId,
        );
        const currentActivity = await manager.findOne(KpiAchievementActivity, {
          where: {
            id: activity.id,
            companyId: root.companyId,
            assignmentId: assignment.id,
            revisionId: revision.id,
            employeeId: actor.employeeId!,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!currentActivity || currentActivity.rowVersion !== dto.rowVersion)
          throw new ConflictException(
            'Activity changed during evidence upload',
          );
        const saved = await manager.save(
          KpiAchievementActivityEvidence,
          manager.create(KpiAchievementActivityEvidence, {
            companyId: root.companyId,
            activityId: currentActivity.id,
            privatePath: file.publicPath,
            fileName: file.originalFileName,
            mimeType: file.mimeType,
            fileSize: file.fileSize,
            uploadedBy: actor.id,
          }),
        );
        currentActivity.rowVersion++;
        await manager.save(currentActivity);
        await this.event(
          manager,
          actor,
          root,
          currentRevision,
          'activity_evidence_added',
          {
            activityId: currentActivity.id,
            evidenceId: saved.id,
            fileName: saved.fileName,
          },
        );
      });
    } catch (error) {
      await this.files.removeManagedFile(file.publicPath);
      throw error;
    }
    return this.get(actor, achievementId);
  }
  async downloadActivityEvidence(
    actor: AuthenticatedUser,
    achievementId: number,
    activityId: number,
    evidenceId: number,
  ) {
    const root = await this.achievements.findOneBy({
      id: achievementId,
      companyId: this.company(actor),
    });
    if (!root) throw new NotFoundException('Achievement not found');
    await this.assignment(actor, root.assignmentId);
    const file = await this.activityEvidence
      .createQueryBuilder('file')
      .addSelect('file.privatePath')
      .where(
        'file.id = :evidenceId AND file.activityId = :activityId AND file.companyId = :companyId',
        { evidenceId, activityId, companyId: root.companyId },
      )
      .getOne();
    if (!file) throw new NotFoundException('Activity evidence not found');
    const activity = await this.activities.findOneBy({
      id: activityId,
      companyId: root.companyId,
      assignmentId: root.assignmentId,
    });
    if (!activity) throw new NotFoundException('Activity evidence not found');
    const buffer = await this.files.readManagedFile(file.privatePath);
    if (!buffer) throw new NotFoundException('Evidence unavailable');
    return createDownloadStream({
      buffer,
      fileName: file.fileName,
      mimeType: file.mimeType,
    });
  }
  async mine(actor: AuthenticatedUser) {
    if (!actor.employeeId)
      throw new ForbiddenException('Employee identity required');
    const assignments = await this.assignments.findBy({
      companyId: this.company(actor),
      subjectType: 'employee',
      subjectId: actor.employeeId,
    });
    if (!assignments.length) return [];
    const roots = await this.achievements.findBy({
      companyId: this.company(actor),
      assignmentId: In(assignments.map((a) => a.id)),
    });
    return Promise.all(roots.map((root) => this.detail(actor, root)));
  }
  async pending(actor: AuthenticatedUser, status?: string) {
    if (!this.isManager(actor))
      throw new ForbiddenException('Manager role required');
    const companyId = this.company(actor);
    const revisions = await this.revisions.find({
      where: {
        companyId,
        status:
          status &&
          [
            'submitted',
            'under_review',
            'approved',
            'returned',
            'rejected',
          ].includes(status)
            ? (status as KpiAchievementRevision['status'])
            : In(['submitted', 'under_review']),
      },
      order: { updatedAt: 'DESC' },
      take: 200,
    });
    const result: Array<Awaited<ReturnType<AchievementService['detail']>>> = [];
    for (const revision of revisions) {
      const root = await this.achievements.findOneBy({
        id: revision.achievementId,
        companyId,
      });
      if (!root || root.latestRevisionId !== revision.id) continue;
      try {
        const assignment = await this.assignment(
          actor,
          root.assignmentId,
          true,
        );
        await this.reviewable(actor, assignment, revision);
        result.push(await this.detail(actor, root));
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error;
      }
    }
    return result;
  }
  async create(actor: AuthenticatedUser, dto: AchievementDraftDto) {
    const assignment = await this.assignment(actor, dto.assignmentId);
    await this.editable(actor, assignment);
    if (assignment.status !== 'active')
      throw new ConflictException('Active KPI assignment required');
    const definition = await this.definitions.findOneBy({
      id: assignment.definitionVersionId,
      companyId: assignment.companyId,
    });
    const target = await this.targets.findOne({
      where: { assignmentId: assignment.id, companyId: assignment.companyId },
      order: { revision: 'DESC' },
    });
    if (!definition?.publishedAt || !target)
      throw new ConflictException('Published definition and target required');
    if (dto.actual !== undefined)
      validateActual(
        definition.measurementType,
        dto.actual,
        definition.measurementType === 'qualitative'
          ? await this.rubric(assignment.companyId, assignment.id)
          : [],
      );
    try {
      const root = await this.db.transaction(async (manager) => {
        let root = await manager.findOne(KpiAchievement, {
          where: {
            assignmentId: assignment.id,
            companyId: assignment.companyId,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (root?.latestRevisionId) {
          const last = await manager.findOneByOrFail(KpiAchievementRevision, {
            id: root.latestRevisionId,
          });
          if (last.status === 'draft') return root;
          if (!['returned', 'rejected'].includes(last.status))
            throw new ConflictException(
              'Achievement already submitted; correction requires authorization',
            );
          const next = await manager.save(
            KpiAchievementRevision,
            manager.create(KpiAchievementRevision, {
              companyId: assignment.companyId,
              achievementId: root.id,
              revision: last.revision + 1,
              status: 'draft',
              actual: dto.actual ?? last.actual,
              comments: dto.comments ?? last.comments,
              definitionVersionId: assignment.definitionVersionId,
              targetRevisionId: target.id,
              periodId: assignment.periodId,
              submittedBy: actor.id,
              submittedAt: null,
              reviewedBy: null,
              reviewedAt: null,
              reviewComment: null,
              rowVersion: 1,
              evidenceRequired: false,
            }),
          );
          await this.carryForwardActivities(
            manager,
            root,
            last.id,
            next,
            assignment,
            actor,
          );
          root.latestRevisionId = next.id;
          await manager.save(root);
          await this.event(
            manager,
            actor,
            root,
            next,
            'correction_draft_created',
            { previousRevisionId: last.id },
          );
          return root;
        }
        root = await manager.save(
          KpiAchievement,
          manager.create(KpiAchievement, {
            companyId: assignment.companyId,
            assignmentId: assignment.id,
            latestRevisionId: null,
            approvedRevisionId: null,
            createdBy: actor.id,
          }),
        );
        const revision = await manager.save(
          KpiAchievementRevision,
          manager.create(KpiAchievementRevision, {
            companyId: assignment.companyId,
            achievementId: root.id,
            revision: 1,
            status: 'draft',
            actual: dto.actual ?? null,
            comments: dto.comments ?? null,
            definitionVersionId: assignment.definitionVersionId,
            targetRevisionId: target.id,
            periodId: assignment.periodId,
            submittedBy: actor.id,
            submittedAt: null,
            reviewedBy: null,
            reviewedAt: null,
            reviewComment: null,
            rowVersion: 1,
            evidenceRequired: false,
          }),
        );
        root.latestRevisionId = revision.id;
        await manager.save(root);
        await this.event(manager, actor, root, revision, 'draft_created');
        return root;
      });
      return this.detail(actor, root);
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('Concurrent achievement draft; reload');
      throw error;
    }
  }
  async update(
    actor: AuthenticatedUser,
    id: number,
    dto: AchievementUpdateDto,
  ) {
    const { root, assignment } = await this.rootAndRevision(actor, id);
    await this.editable(actor, assignment);
    await this.db.transaction(async (manager) => {
      const revision = await manager.findOne(KpiAchievementRevision, {
        where: { id: root.latestRevisionId! },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !revision ||
        revision.status !== 'draft' ||
        revision.rowVersion !== dto.rowVersion
      )
        throw new ConflictException('Draft changed; reload before editing');
      if (dto.actual !== undefined) {
        const definition = await this.definitions.findOneByOrFail({
          id: revision.definitionVersionId,
          companyId: root.companyId,
        });
        validateActual(
          definition.measurementType,
          dto.actual,
          definition.measurementType === 'qualitative'
            ? await this.rubric(root.companyId, root.assignmentId)
            : [],
        );
      }
      const before = { actual: revision.actual, comments: revision.comments };
      if (dto.actual !== undefined) revision.actual = dto.actual;
      if (dto.comments !== undefined) revision.comments = dto.comments;
      revision.rowVersion++;
      await manager.save(revision);
      await this.event(manager, actor, root, revision, 'draft_updated', {
        before,
        after: { actual: revision.actual, comments: revision.comments },
      });
    });
    return this.get(actor, id);
  }
  async submit(actor: AuthenticatedUser, id: number, rowVersion: number) {
    const { root, assignment } = await this.rootAndRevision(actor, id);
    await this.editable(actor, assignment);
    await this.db.transaction(async (manager) => {
      const revision = await manager.findOne(KpiAchievementRevision, {
        where: { id: root.latestRevisionId! },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !revision ||
        revision.status !== 'draft' ||
        revision.rowVersion !== rowVersion
      )
        throw new ConflictException('Draft changed or already submitted');
      if (assignment.status !== 'active')
        throw new ConflictException('Assignment is inactive');
      const latestTarget = await this.targets.findOne({
        where: { assignmentId: assignment.id, companyId: root.companyId },
        order: { revision: 'DESC' },
      });
      if (latestTarget?.id !== revision.targetRevisionId)
        throw new ConflictException(
          'Target changed; ask a manager to reconcile this draft',
        );
      await this.validate(root.companyId, revision);
      const rule = await this.rules.findOneBy({
        companyId: root.companyId,
        definitionVersionId: revision.definitionVersionId,
      });
      const [submissionEvidenceCount, ownedActivities] = await Promise.all([
        this.evidence.countBy({
          companyId: root.companyId,
          revisionId: revision.id,
        }),
        this.activities.findBy({
          companyId: root.companyId,
          revisionId: revision.id,
        }),
      ]);
      const activityEvidenceCount = ownedActivities.length
        ? await this.activityEvidence.countBy({
            companyId: root.companyId,
            activityId: In(ownedActivities.map((activity) => activity.id)),
          })
        : 0;
      const files = submissionEvidenceCount + activityEvidenceCount;
      if (rule?.required && files === 0)
        throw new BadRequestException(
          'Supporting evidence is required for this KPI',
        );
      revision.evidenceRequired = rule?.required ?? false;
      revision.status = 'submitted';
      revision.submittedAt = new Date();
      revision.submittedBy = actor.id;
      revision.rowVersion++;
      await manager.save(revision);
      await this.event(manager, actor, root, revision, 'submitted', {
        evidenceCount: files,
        evidenceRequired: revision.evidenceRequired,
      });
    });
    await this.queueReview(root, assignment);
    await this.achievementNotification(
      root,
      assignment,
      'manager',
      NotificationTypeEnum.KPI_ACHIEVEMENT_SUBMITTED,
      'submitted',
      'KPI achievement submitted for review',
      `An employee submitted KPI assignment #${assignment.id}. Open it to review the result and supporting activities.`,
      rowVersion + 1,
    );
    return this.get(actor, id);
  }
  async startReview(actor: AuthenticatedUser, id: number, rowVersion: number) {
    const { root, assignment } = await this.rootAndRevision(actor, id);
    await this.db.transaction(async (manager) => {
      const revision = await manager.findOne(KpiAchievementRevision, {
        where: { id: root.latestRevisionId! },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !revision ||
        revision.status !== 'submitted' ||
        revision.rowVersion !== rowVersion
      )
        throw new ConflictException('Submission already changed');
      await this.reviewable(actor, assignment, revision);
      revision.status = 'under_review';
      revision.rowVersion++;
      await manager.save(revision);
      await this.event(manager, actor, root, revision, 'review_started');
    });
    await this.achievementNotification(
      root,
      assignment,
      'employee',
      NotificationTypeEnum.KPI_ACHIEVEMENT_REVIEW_STARTED,
      'review-started',
      'Your KPI achievement is being reviewed',
      `Your manager has started reviewing KPI assignment #${assignment.id}.`,
      rowVersion + 1,
    );
    return this.get(actor, id);
  }
  async decide(
    actor: AuthenticatedUser,
    id: number,
    decision: 'approved' | 'returned' | 'rejected',
    dto: AchievementReviewDto,
  ) {
    const { root, assignment } = await this.rootAndRevision(actor, id);
    await this.db.transaction(async (manager) => {
      const lockedRoot = await manager.findOne(KpiAchievement, {
        where: { id: root.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedRoot) throw new NotFoundException('Achievement not found');
      const revision = await manager.findOne(KpiAchievementRevision, {
        where: { id: lockedRoot.latestRevisionId! },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !revision ||
        !['submitted', 'under_review'].includes(revision.status) ||
        revision.rowVersion !== dto.rowVersion
      )
        throw new ConflictException('Review decision conflict; reload');
      await this.reviewable(actor, assignment, revision);
      if (assignment.status !== 'active')
        throw new ConflictException('Assignment is inactive');
      if (decision !== 'approved' && !dto.comments?.trim())
        throw new BadRequestException('A reason is required');
      if (decision === 'approved') {
        await this.validate(root.companyId, revision);
        const latestTarget = await this.targets.findOne({
          where: { assignmentId: assignment.id, companyId: root.companyId },
          order: { revision: 'DESC' },
        });
        if (latestTarget?.id !== revision.targetRevisionId)
          throw new ConflictException(
            'Target changed after submission; approval requires reconciliation',
          );
        if (
          lockedRoot.approvedRevisionId &&
          lockedRoot.approvedRevisionId !== revision.id
        ) {
          const previous = await manager.findOne(KpiAchievementRevision, {
            where: { id: lockedRoot.approvedRevisionId },
            lock: { mode: 'pessimistic_write' },
          });
          if (previous?.status === 'approved') {
            previous.status = 'superseded';
            previous.rowVersion++;
            await manager.save(previous);
            await this.event(manager, actor, root, previous, 'superseded', {
              replacementRevisionId: revision.id,
            });
          }
        }
        lockedRoot.approvedRevisionId = revision.id;
      }
      revision.status = decision;
      revision.reviewedBy = actor.id;
      revision.reviewedAt = new Date();
      revision.reviewComment = dto.comments?.trim() ?? null;
      revision.rowVersion++;
      await manager.save(revision);
      await manager.save(lockedRoot);
      await this.event(manager, actor, root, revision, decision, {
        assignmentId: assignment.id,
        revision: revision.revision,
      });
    });
    await this.completeReview(root);
    const notification = {
      approved: {
        type: NotificationTypeEnum.KPI_ACHIEVEMENT_APPROVED,
        title: 'Your KPI achievement was approved',
        message: `Your manager approved KPI assignment #${assignment.id}.`,
      },
      returned: {
        type: NotificationTypeEnum.KPI_ACHIEVEMENT_RETURNED,
        title: 'Your KPI achievement was returned',
        message:
          `Your manager returned KPI assignment #${assignment.id} for correction. ${dto.comments?.trim() ?? ''}`.trim(),
      },
      rejected: {
        type: NotificationTypeEnum.KPI_ACHIEVEMENT_REJECTED,
        title: 'Your KPI achievement was rejected',
        message:
          `Your manager rejected KPI assignment #${assignment.id}. ${dto.comments?.trim() ?? ''}`.trim(),
      },
    }[decision];
    await this.achievementNotification(
      root,
      assignment,
      'employee',
      notification.type,
      decision,
      notification.title,
      notification.message,
      dto.rowVersion + 1,
    );
    return this.get(actor, id);
  }
  async correction(actor: AuthenticatedUser, id: number) {
    const { root, revision, assignment } = await this.rootAndRevision(
      actor,
      id,
    );
    await this.reviewable(actor, assignment, revision);
    if (revision.status !== 'approved')
      throw new ConflictException(
        'Only an approved result can enter authorized correction',
      );
    await this.db.transaction(async (manager) => {
      const locked = await manager.findOne(KpiAchievement, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked || locked.latestRevisionId !== revision.id)
        throw new ConflictException('Achievement changed');
      const next = await manager.save(
        KpiAchievementRevision,
        manager.create(KpiAchievementRevision, {
          companyId: root.companyId,
          achievementId: id,
          revision: revision.revision + 1,
          status: 'draft',
          actual: revision.actual,
          comments: revision.comments,
          definitionVersionId: revision.definitionVersionId,
          targetRevisionId: revision.targetRevisionId,
          periodId: revision.periodId,
          submittedBy: actor.id,
          submittedAt: null,
          reviewedBy: null,
          reviewedAt: null,
          reviewComment: null,
          rowVersion: 1,
          evidenceRequired: revision.evidenceRequired,
        }),
      );
      await this.carryForwardActivities(
        manager,
        locked,
        revision.id,
        next,
        assignment,
        actor,
      );
      locked.latestRevisionId = next.id;
      await manager.save(locked);
      await this.event(
        manager,
        actor,
        locked,
        next,
        'approved_correction_opened',
        { priorApprovedRevisionId: revision.id },
      );
    });
    return this.get(actor, id);
  }
  async upload(actor: AuthenticatedUser, id: number, dto: EvidenceUploadDto) {
    const { root, assignment, revision } = await this.rootAndRevision(
      actor,
      id,
    );
    await this.editable(actor, assignment);
    if (revision.status !== 'draft' || revision.rowVersion !== dto.rowVersion)
      throw new ConflictException('Only the current draft accepts evidence');
    const file = await this.files.savePrivateBase64File(dto.file, {
      directorySegments: [
        'kpi-achievements',
        String(root.companyId),
        String(root.id),
        String(revision.id),
      ],
      allowedMimeTypes: [...HR_PRIVATE_DOCUMENT_MIME_TYPES],
      maxFileSizeBytes: HR_PRIVATE_DOCUMENT_MAX_BYTES,
      validateFileSignature: true,
    });
    try {
      await this.db.transaction(async (manager) => {
        const current = await manager.findOne(KpiAchievementRevision, {
          where: { id: revision.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !current ||
          current.status !== 'draft' ||
          current.rowVersion !== dto.rowVersion
        )
          throw new ConflictException('Draft changed during upload');
        const saved = await manager.save(
          KpiAchievementEvidence,
          manager.create(KpiAchievementEvidence, {
            companyId: root.companyId,
            revisionId: current.id,
            privatePath: file.publicPath,
            fileName: file.originalFileName,
            mimeType: file.mimeType,
            fileSize: file.fileSize,
            uploadedBy: actor.id,
          }),
        );
        current.rowVersion++;
        await manager.save(current);
        await this.event(manager, actor, root, current, 'evidence_added', {
          evidenceId: saved.id,
          fileName: saved.fileName,
        });
      });
    } catch (error) {
      await this.files.removeManagedFile(file.publicPath);
      throw error;
    }
    return this.get(actor, id);
  }
  async download(
    actor: AuthenticatedUser,
    achievementId: number,
    evidenceId: number,
  ) {
    const root = await this.achievements.findOneBy({
      id: achievementId,
      companyId: this.company(actor),
    });
    if (!root) throw new NotFoundException('Achievement not found');
    await this.assignment(actor, root.assignmentId);
    const file = await this.evidence
      .createQueryBuilder('file')
      .addSelect('file.privatePath')
      .where('file.id = :evidenceId AND file.companyId = :companyId', {
        evidenceId,
        companyId: root.companyId,
      })
      .getOne();
    if (
      !file ||
      !(await this.revisions.existsBy({
        id: file.revisionId,
        achievementId: root.id,
        companyId: root.companyId,
      }))
    )
      throw new NotFoundException('Evidence not found');
    const buffer = await this.files.readManagedFile(file.privatePath);
    if (!buffer) throw new NotFoundException('Evidence unavailable');
    return createDownloadStream({
      buffer,
      fileName: file.fileName,
      mimeType: file.mimeType,
    });
  }
  async evidenceRule(
    actor: AuthenticatedUser,
    definitionVersionId: number,
    required: boolean,
  ) {
    if (!this.isAdmin(actor))
      throw new ForbiddenException('Company KPI administrator required');
    const companyId = this.company(actor);
    if (
      !(await this.definitions.existsBy({ id: definitionVersionId, companyId }))
    )
      throw new NotFoundException('KPI definition version not found');
    let rule = await this.rules.findOneBy({ companyId, definitionVersionId });
    if (!rule)
      rule = this.rules.create({
        companyId,
        definitionVersionId,
        required,
        changedBy: actor.id,
      });
    else {
      rule.required = required;
      rule.changedBy = actor.id;
    }
    return this.rules.save(rule);
  }
}
