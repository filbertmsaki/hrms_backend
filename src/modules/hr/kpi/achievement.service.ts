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
  KpiTargetRevision,
} from './kpi.entities';
import { KpiService } from './kpi.service';
import { ScorecardVersion, ScoringPolicyVersion } from './scorecard.entities';
import {
  AchievementDraftDto,
  AchievementReviewDto,
  AchievementUpdateDto,
  EvidenceUploadDto,
} from './dto/achievement.dto';
import {
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
  ) {}

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
      assignment.managerEmployeeId &&
      actor.employeeId !== assignment.managerEmployeeId
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
          }
        : null,
      revisions: revisions.map((revision) => ({
        ...revision,
        evidence: evidence.filter((file) => file.revisionId === revision.id),
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
      const files = await this.evidence.countBy({
        companyId: root.companyId,
        revisionId: revision.id,
      });
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
