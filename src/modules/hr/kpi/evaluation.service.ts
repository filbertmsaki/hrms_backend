import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../shared/hr-access.service';
import { Employee } from '../employees/entities/employee.entity';
import { Company } from '../../companies/entities/company.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationChannelEnum } from '../../notifications/enums/notification-channel.enum';
import { NotificationCategoryEnum } from '../../notifications/enums/notification-category.enum';
import { ActionItemsService } from '../action-inbox/action-items.service';
import { ActionItem } from '../action-inbox/entities/action-item.entity';
import { ActionItemStatusEnum } from '../action-inbox/enums/action-item-status.enum';
import { ActionItemTypeEnum } from '../action-inbox/enums/action-item-type.enum';
import { KpiPeriod } from './kpi.entities';
import { Scorecard } from './scorecard.entities';
import { ScorecardService } from './scorecard.service';
import {
  EvaluationActionDto,
  EvaluationAckDto,
  EvaluationCycleDto,
  EvaluationDeadlineExceptionDto,
  EvaluationDeadlinePolicyDto,
  EvaluationEnrollDto,
  EvaluationReviewerDto,
  EvaluationTemplateDto,
  ManagerAssessmentDto,
  SelfAssessmentDto,
  TemplateRevisionDto,
} from './dto/evaluation.dto';
import {
  EvaluationCycle,
  EvaluationDeadlineException,
  EvaluationEvent,
  EvaluationRevision,
  EvaluationTemplate,
  EvaluationTemplateVersion,
  PerformanceEvaluation,
} from './evaluation.entities';

const admins = ['COMPANY_ADMIN', 'HR_MANAGER'];
const managers = ['DEPARTMENT_MANAGER', 'BRANCH_MANAGER', ...admins];
type TemplateInput = TemplateRevisionDto | EvaluationTemplateDto;

export function evaluationLocalDeadline(date: string, zone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day)
    throw new BadRequestException('Invalid evaluation deadline');
  const localEnd = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  let instant = localEnd;
  for (let attempt = 0; attempt < 3; attempt++) {
    const label =
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        timeZoneName: 'shortOffset',
      })
        .formatToParts(new Date(instant))
        .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
    const match = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(label);
    if (!match)
      throw new BadRequestException('Invalid organization timezone offset');
    const offset = match[1]
      ? (match[1] === '+' ? 1 : -1) *
        (Number(match[2]) * 60 + Number(match[3] ?? 0))
      : 0;
    instant = localEnd - offset * 60_000;
  }
  return new Date(instant);
}

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);
  constructor(
    private readonly db: DataSource,
    private readonly access: HrAccessService,
    private readonly scorecards: ScorecardService,
    private readonly inbox: ActionItemsService,
    private readonly notifications: NotificationsService,
  ) {}
  private async refreshInbox(
    row: PerformanceEvaluation,
    stage: 'self' | 'manager' | 'hr' | 'ack' | null,
  ) {
    try {
      await this.inbox.completeAllOpenForEntity(
        row.companyId,
        'kpi',
        'evaluation',
        row.id,
      );
      if (!stage) return;
      const assigneeId =
        stage === 'manager'
          ? row.managerEmployeeId
          : stage === 'hr'
            ? null
            : row.employeeId;
      const employee = assigneeId
        ? await this.db
            .getRepository(Employee)
            .findOneBy({ id: assigneeId, company_id: row.companyId })
        : null;
      const membershipId =
        stage === 'hr'
          ? row.hrReviewerCompanyUserId
          : employee?.company_user_id;
      if (!membershipId) return;
      const cycle = await this.db
        .getRepository(EvaluationCycle)
        .findOneBy({ id: row.cycleId, companyId: row.companyId });
      const dueDate =
        stage === 'self'
          ? cycle?.selfDeadline
          : stage === 'manager'
            ? cycle?.managerDeadline
            : stage === 'hr'
              ? cycle?.hrDeadline
              : cycle?.ackDeadline;
      const company = dueDate
        ? await this.db.getRepository(Company).findOneBy({ id: row.companyId })
        : null;
      const zone =
        typeof company?.metadata?.timezone === 'string'
          ? company.metadata.timezone
          : 'UTC';
      await this.inbox.upsertOpen({
        companyId: row.companyId,
        assigneeCompanyUserId: membershipId,
        assigneeEmployeeId: assigneeId,
        actionType:
          stage === 'manager' || stage === 'hr'
            ? ActionItemTypeEnum.APPROVAL
            : ActionItemTypeEnum.TASK,
        sourceModule: 'kpi',
        sourceEntityType: 'evaluation',
        sourceEntityId: row.id,
        sourceKey: `kpi:evaluation:${row.id}:${stage}`,
        title:
          stage === 'manager'
            ? 'Review employee evaluation'
            : stage === 'hr'
              ? 'Complete HR evaluation review'
              : stage === 'ack'
                ? 'Acknowledge performance evaluation'
                : 'Complete self-assessment',
        description: `Evaluation #${row.id} requires your action`,
        branchId: Number(row.organizationSnapshot?.branchId) || null,
        departmentId: Number(row.organizationSnapshot?.departmentId) || null,
        actionUrl:
          stage === 'manager' || stage === 'hr'
            ? `/dashboard/kpi/evaluations/${row.id}`
            : `/dashboard/me/evaluations/${row.id}`,
        dueAt: dueDate ? evaluationLocalDeadline(dueDate, zone) : null,
      });
      await this.notifications.createAndPush({
        company_id: row.companyId,
        receiver_company_user_id: membershipId,
        category: NotificationCategoryEnum.HR,
        title:
          stage === 'hr'
            ? 'HR evaluation review required'
            : stage === 'manager'
              ? row.status === 'manager_draft'
                ? 'Evaluation returned for manager correction'
                : 'Self-assessment submitted; manager review required'
              : stage === 'ack'
                ? 'Evaluation acknowledgement required'
                : row.status === 'self_returned'
                  ? 'Self-assessment returned for correction'
                  : 'Performance evaluation assigned',
        message: `Evaluation #${row.id} requires your action.`,
        related_module: 'kpi',
        entity_type: 'evaluation',
        entity_id: row.id,
        action_url:
          stage === 'hr' || stage === 'manager'
            ? `/dashboard/kpi/evaluations/${row.id}`
            : `/dashboard/me/evaluations/${row.id}`,
        dedupe_key: `kpi:evaluation:${row.id}:${stage}:${row.rowVersion}`,
        event_key:
          process.env.KPI_EVALUATION_OUTBOUND_ENABLED === 'true'
            ? `kpi.evaluation.${stage}.required`
            : undefined,
        channels: [NotificationChannelEnum.IN_APP],
      });
    } catch (error) {
      this.logger.warn(
        `Unable to update appraisal action item ${row.id}: ${(error as Error).message}`,
      );
    }
  }
  private async notifyEmployee(
    row: PerformanceEvaluation,
    event: string,
    title: string,
  ) {
    try {
      const employee = await this.db
        .getRepository(Employee)
        .findOneBy({ id: row.employeeId, company_id: row.companyId });
      if (!employee?.company_user_id) return;
      await this.notifications.createAndPush({
        company_id: row.companyId,
        receiver_company_user_id: employee.company_user_id,
        category: NotificationCategoryEnum.HR,
        title,
        message: `Evaluation #${row.id} has an update. Open it to view the details.`,
        related_module: 'kpi',
        entity_type: 'evaluation',
        entity_id: row.id,
        action_url: `/dashboard/me/evaluations/${row.id}`,
        dedupe_key: `kpi:evaluation:${row.id}:${event}:${row.rowVersion}`,
        event_key:
          process.env.KPI_EVALUATION_OUTBOUND_ENABLED === 'true'
            ? `kpi.evaluation.${event}`
            : undefined,
        channels: [NotificationChannelEnum.IN_APP],
      });
    } catch (error) {
      this.logger.warn(
        `Evaluation notification ${row.id} failed: ${(error as Error).message}`,
      );
    }
  }
  @Cron('0 0 8 * * *')
  async sendDeadlineReminders() {
    const rows = await this.db.getRepository(PerformanceEvaluation).find();
    for (const row of rows) {
      const stage = ['self_draft', 'self_returned'].includes(row.status)
        ? 'self'
        : ['self_submitted', 'manager_draft'].includes(row.status)
          ? 'manager'
          : ['manager_submitted', 'hr_reviewed'].includes(row.status) &&
              row.hrReviewerCompanyUserId
            ? 'hr'
            : row.status === 'finalized' && !row.ackStatus
              ? 'ack'
              : null;
      const openItems = await this.db.getRepository(ActionItem).find({
        where: {
          companyId: row.companyId,
          sourceModule: 'kpi',
          sourceEntityType: 'evaluation',
          sourceEntityId: String(row.id),
          status: ActionItemStatusEnum.OPEN,
        },
      });
      const employeeForStage =
        stage === 'self' || stage === 'ack'
          ? await this.db.getRepository(Employee).findOneBy({
              id: row.employeeId,
              company_id: row.companyId,
            })
          : stage === 'manager'
            ? await this.db.getRepository(Employee).findOneBy({
                id: row.managerEmployeeId,
                company_id: row.companyId,
              })
            : null;
      const expectedAssignee =
        stage === 'hr'
          ? row.hrReviewerCompanyUserId
          : employeeForStage?.company_user_id;
      if (
        (stage &&
          (expectedAssignee
            ? openItems.length !== 1 ||
              openItems[0].sourceKey !== `kpi:evaluation:${row.id}:${stage}` ||
              openItems[0].assigneeCompanyUserId !== expectedAssignee
            : openItems.length > 0)) ||
        (!stage && openItems.length)
      )
        await this.refreshInbox(row, stage);
      if (!stage) continue;
      const cycle = await this.db
        .getRepository(EvaluationCycle)
        .findOneBy({ id: row.cycleId, companyId: row.companyId });
      const deadline =
        stage === 'self'
          ? cycle?.selfDeadline
          : stage === 'manager'
            ? cycle?.managerDeadline
            : stage === 'hr'
              ? cycle?.hrDeadline
              : cycle?.ackDeadline;
      if (!deadline) continue;
      const company = await this.db
        .getRepository(Company)
        .findOneBy({ id: row.companyId });
      const zone =
        typeof company?.metadata?.timezone === 'string'
          ? company.metadata.timezone
          : 'UTC';
      let today: string;
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: zone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(new Date());
        const value = (type: string) =>
          parts.find((part) => part.type === type)?.value ?? '';
        today = `${value('year')}-${value('month')}-${value('day')}`;
      } catch {
        this.logger.warn(`Invalid timezone on company ${row.companyId}`);
        continue;
      }
      const days = Math.round(
        (Date.parse(`${deadline}T00:00:00Z`) -
          Date.parse(`${today}T00:00:00Z`)) /
          86_400_000,
      );
      if (days > 3) continue;
      const receiver =
        stage === 'hr'
          ? row.hrReviewerCompanyUserId
          : employeeForStage?.company_user_id;
      if (!receiver) continue;
      try {
        await this.notifications.createAndPush({
          company_id: row.companyId,
          receiver_company_user_id: receiver,
          category: NotificationCategoryEnum.HR,
          title:
            days < 0
              ? 'Evaluation action overdue'
              : 'Evaluation deadline approaching',
          message: `Evaluation #${row.id} ${days < 0 ? 'is overdue' : `is due on ${deadline}`}.`,
          related_module: 'kpi',
          entity_type: 'evaluation',
          entity_id: row.id,
          action_url:
            stage === 'hr' || stage === 'manager'
              ? `/dashboard/kpi/evaluations/${row.id}`
              : `/dashboard/me/evaluations/${row.id}`,
          dedupe_key: `kpi:evaluation:${row.id}:${stage}:deadline:${today}`,
          event_key:
            process.env.KPI_EVALUATION_OUTBOUND_ENABLED === 'true'
              ? days < 0
                ? 'kpi.evaluation.overdue'
                : 'kpi.evaluation.deadline.approaching'
              : undefined,
          channels: [NotificationChannelEnum.IN_APP],
        });
      } catch (error) {
        this.logger.warn(
          `Evaluation reminder ${row.id} failed: ${(error as Error).message}`,
        );
      }
    }
  }
  private company(actor: AuthenticatedUser) {
    return this.access.ensureActorCompanyId(actor);
  }
  private admin(actor: AuthenticatedUser) {
    if (
      !admins.some((r) => actor.roles.includes(r)) ||
      !this.access.hasCompanyScope(actor)
    )
      throw new ForbiddenException('Company HR administration scope required');
  }
  private async hrReviewer(
    companyId: number,
    preferredId?: number | null,
    subjectEmployeeId?: number,
  ) {
    const candidates = await this.db
      .getRepository(CompanyUser)
      .createQueryBuilder('member')
      .innerJoin('member.role_assignments', 'assignment')
      .innerJoin('assignment.role', 'role')
      .innerJoin('role.permissions', 'scopePermission')
      .where('member.company_id = :companyId AND member.status = :status', {
        companyId,
        status: 'active',
      })
      .andWhere('role.name IN (:...roles)', { roles: admins })
      .andWhere('scopePermission.name = :scope', {
        scope: 'data_scope:company',
      })
      .distinct(true)
      .orderBy('member.id', 'ASC')
      .getMany();
    const subject = subjectEmployeeId
      ? await this.db
          .getRepository(Employee)
          .findOneBy({ id: subjectEmployeeId, company_id: companyId })
      : null;
    const eligible = candidates.filter(
      (candidate) => candidate.id !== subject?.company_user_id,
    );
    const selected = preferredId
      ? eligible.find((candidate) => candidate.id === preferredId)
      : eligible.length === 1
        ? eligible[0]
        : null;
    if (!selected)
      throw new BadRequestException(
        'Select an active, separate company HR reviewer',
      );
    return selected.id;
  }
  private async deadlineState(
    row: PerformanceEvaluation,
    stage: 'self' | 'manager' | 'hr' | 'ack',
    at = new Date(),
  ) {
    const cycle = await this.db
      .getRepository(EvaluationCycle)
      .findOneByOrFail({ id: row.cycleId, companyId: row.companyId });
    const deadline =
      stage === 'self'
        ? cycle.selfDeadline
        : stage === 'manager'
          ? cycle.managerDeadline
          : stage === 'hr'
            ? cycle.hrDeadline
            : cycle.ackDeadline;
    if (!deadline)
      return {
        late: false,
        exception: null as EvaluationDeadlineException | null,
      };
    const company = await this.db
      .getRepository(Company)
      .findOneBy({ id: row.companyId });
    const zone =
      typeof company?.metadata?.timezone === 'string'
        ? company.metadata.timezone
        : 'UTC';
    let localDate: string;
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(at);
      const value = (type: string) =>
        parts.find((part) => part.type === type)?.value ?? '';
      localDate = `${value('year')}-${value('month')}-${value('day')}`;
    } catch {
      throw new BadRequestException('Organization timezone is invalid');
    }
    const late = localDate > deadline;
    const exception =
      late && cycle.deadlinePolicy?.mode === 'hard'
        ? await this.db.getRepository(EvaluationDeadlineException).findOneBy({
            evaluationId: row.id,
            companyId: row.companyId,
            stage,
          })
        : null;
    if (late && cycle.deadlinePolicy?.mode === 'hard' && !exception)
      throw new ConflictException(
        `${stage} deadline passed on ${deadline}; an approved exception is required`,
      );
    return { late, exception };
  }
  private async employee(actor: AuthenticatedUser, id: number) {
    const row = await this.db
      .getRepository(Employee)
      .findOneBy({ id, company_id: this.company(actor) });
    if (!row) throw new NotFoundException('Employee not found');
    return row;
  }
  private validateTemplate(input: TemplateInput) {
    const { competencies, scale, sectionWeights } = input;
    if (
      !Array.isArray(competencies) ||
      competencies.length > 50 ||
      !Array.isArray(scale) ||
      scale.length < 2 ||
      scale.length > 10
    )
      throw new BadRequestException(
        'Template requires 2–10 scale points and at most 50 competencies',
      );
    const codes = new Set<string>(),
      values = new Set<number>();
    for (const item of competencies) {
      if (
        !item ||
        typeof item.code !== 'string' ||
        !/^[A-Z][A-Z0-9_]{1,39}$/.test(item.code) ||
        typeof item.name !== 'string' ||
        !item.name.trim() ||
        codes.has(item.code)
      )
        throw new BadRequestException(
          'Competency codes and names must be unique and valid',
        );
      codes.add(item.code);
    }
    for (const item of scale) {
      if (
        !item ||
        !Number.isInteger(item.value) ||
        item.value < 0 ||
        item.value > 10 ||
        typeof item.label !== 'string' ||
        !item.label.trim() ||
        values.has(item.value)
      )
        throw new BadRequestException(
          'Rating scale values and labels must be unique and valid',
        );
      values.add(item.value);
    }
    if (sectionWeights) {
      const { kpi, competency } = sectionWeights;
      if (
        !Number.isFinite(kpi) ||
        !Number.isFinite(competency) ||
        kpi < 0 ||
        competency < 0 ||
        Math.round((kpi + competency) * 10000) !== 1000000
      )
        throw new BadRequestException(
          'Section weights must be nonnegative and total 100%',
        );
      // Configured weights remain informational until company policy approval.
    }
    return {
      competencies,
      scale,
      requireHrReview: input.requireHrReview,
      sectionWeights: sectionWeights ?? null,
    };
  }
  async templates(actor: AuthenticatedUser) {
    this.admin(actor);
    const rows = await this.db
      .getRepository(EvaluationTemplate)
      .findBy({ companyId: this.company(actor) });
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        versions: await this.db.getRepository(EvaluationTemplateVersion).find({
          where: { templateId: row.id, companyId: row.companyId },
          order: { version: 'DESC' },
        }),
      })),
    );
  }
  async createTemplate(actor: AuthenticatedUser, dto: EvaluationTemplateDto) {
    this.admin(actor);
    const companyId = this.company(actor);
    const config = this.validateTemplate(dto);
    return this.db.transaction(async (m) => {
      const template = await m.save(
        EvaluationTemplate,
        m.create(EvaluationTemplate, {
          companyId,
          code: dto.code.trim().toUpperCase(),
          createdBy: actor.id,
        }),
      );
      const version = await m.save(
        EvaluationTemplateVersion,
        m.create(EvaluationTemplateVersion, {
          companyId,
          templateId: template.id,
          version: 1,
          name: dto.name.trim(),
          config,
          createdBy: actor.id,
        }),
      );
      return { ...template, versions: [version] };
    });
  }
  async reviseTemplate(
    actor: AuthenticatedUser,
    id: number,
    dto: TemplateRevisionDto,
  ) {
    this.admin(actor);
    const companyId = this.company(actor);
    const config = this.validateTemplate(dto);
    const template = await this.db
      .getRepository(EvaluationTemplate)
      .findOneBy({ id, companyId });
    if (!template) throw new NotFoundException('Appraisal template not found');
    return this.db.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `phase4-template:${id}`,
      ]);
      const latest = await m.findOne(EvaluationTemplateVersion, {
        where: { templateId: id, companyId },
        order: { version: 'DESC' },
      });
      const version = await m.save(
        EvaluationTemplateVersion,
        m.create(EvaluationTemplateVersion, {
          companyId,
          templateId: id,
          version: (latest?.version ?? 0) + 1,
          name: dto.name.trim(),
          config,
          createdBy: actor.id,
        }),
      );
      return version;
    });
  }
  async publishTemplate(actor: AuthenticatedUser, id: number) {
    this.admin(actor);
    const companyId = this.company(actor);
    return this.db.transaction(async (m) => {
      const version = await m.findOne(EvaluationTemplateVersion, {
        where: { id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!version) throw new NotFoundException('Template version not found');
      if (version.publishedAt)
        throw new ConflictException('Template version is already published');
      version.publishedAt = new Date();
      return m.save(version);
    });
  }
  async cycles(actor: AuthenticatedUser) {
    this.admin(actor);
    return this.db.getRepository(EvaluationCycle).find({
      where: { companyId: this.company(actor) },
      order: { id: 'DESC' },
    });
  }
  async createCycle(actor: AuthenticatedUser, dto: EvaluationCycleDto) {
    this.admin(actor);
    const companyId = this.company(actor);
    const [period, version] = await Promise.all([
      this.db
        .getRepository(KpiPeriod)
        .findOneBy({ id: dto.periodId, companyId }),
      this.db
        .getRepository(EvaluationTemplateVersion)
        .findOneBy({ id: dto.templateVersionId, companyId }),
    ]);
    if (!period || period.frequency !== dto.frequency || !version?.publishedAt)
      throw new BadRequestException(
        'Matching period and published appraisal template are required',
      );
    if (
      dto.startDate > dto.endDate ||
      dto.startDate < period.startDate ||
      dto.endDate > period.endDate
    )
      throw new BadRequestException(
        'Cycle dates must fit the reporting period',
      );
    if (
      [dto.selfDeadline, dto.managerDeadline, dto.hrDeadline, dto.ackDeadline]
        .filter(Boolean)
        .some((d) => d! < dto.startDate)
    )
      throw new BadRequestException('Deadlines cannot precede cycle start');
    const deadlines = [
      dto.selfDeadline,
      dto.managerDeadline,
      dto.hrDeadline,
      dto.ackDeadline,
    ].filter((date): date is string => !!date);
    if (
      deadlines.some((date, index) => index > 0 && date < deadlines[index - 1])
    )
      throw new BadRequestException('Deadlines must follow the review order');
    const preferredReviewerId =
      dto.hrReviewerCompanyUserId ??
      (version.config.requireHrReview ? actor.companyMembershipId : null);
    const reviewerId = preferredReviewerId
      ? await this.hrReviewer(companyId, preferredReviewerId)
      : null;
    return this.db.getRepository(EvaluationCycle).save({
      companyId,
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      frequency: dto.frequency,
      periodId: dto.periodId,
      templateVersionId: version.id,
      startDate: dto.startDate,
      endDate: dto.endDate,
      selfDeadline: dto.selfDeadline ?? null,
      managerDeadline: dto.managerDeadline ?? null,
      hrDeadline: dto.hrDeadline ?? null,
      ackDeadline: dto.ackDeadline ?? null,
      hrReviewerCompanyUserId: reviewerId,
      deadlinePolicy: { mode: 'soft' },
      status: 'draft',
      createdBy: actor.id,
    });
  }
  async setDeadlinePolicy(
    actor: AuthenticatedUser,
    id: number,
    dto: EvaluationDeadlinePolicyDto,
  ) {
    this.admin(actor);
    const cycle = await this.db
      .getRepository(EvaluationCycle)
      .findOneBy({ id, companyId: this.company(actor) });
    if (!cycle) throw new NotFoundException('Cycle not found');
    if (cycle.status !== 'draft')
      throw new ConflictException(
        'Deadline policy can only be selected before a cycle opens',
      );
    if (dto.mode === 'hard') {
      const company = await this.db
        .getRepository(Company)
        .findOneBy({ id: cycle.companyId });
      const policy = company?.metadata?.evaluationHardDeadlinePolicy as
        | Record<string, unknown>
        | undefined;
      if (
        !policy ||
        policy.status !== 'approved' ||
        typeof policy.policyId !== 'string' ||
        !policy.policyId.trim() ||
        !Number.isInteger(policy.approvedBy) ||
        typeof policy.approvedAt !== 'string' ||
        Number.isNaN(Date.parse(policy.approvedAt))
      )
        throw new ForbiddenException(
          'Hard deadlines require a recorded, approved organization policy',
        );
      cycle.deadlinePolicy = {
        mode: 'hard',
        policyId: policy.policyId,
        approvedBy: policy.approvedBy as number,
        approvedAt: policy.approvedAt,
        configuredBy: actor.id,
        reason: dto.reason.trim(),
      };
    } else
      cycle.deadlinePolicy = {
        mode: 'soft',
        configuredBy: actor.id,
        reason: dto.reason.trim(),
      };
    return this.db.getRepository(EvaluationCycle).save(cycle);
  }
  async grantDeadlineException(
    actor: AuthenticatedUser,
    id: number,
    dto: EvaluationDeadlineExceptionDto,
  ) {
    this.admin(actor);
    const { row } = await this.row(actor, id);
    if (actor.employeeId === row.employeeId)
      throw new ForbiddenException('Self exception approval is forbidden');
    const cycle = await this.db.getRepository(EvaluationCycle).findOneByOrFail({
      id: row.cycleId,
      companyId: row.companyId,
    });
    const dueDate =
      dto.stage === 'self'
        ? cycle.selfDeadline
        : dto.stage === 'manager'
          ? cycle.managerDeadline
          : dto.stage === 'hr'
            ? cycle.hrDeadline
            : cycle.ackDeadline;
    if (cycle.deadlinePolicy?.mode !== 'hard' || !dueDate)
      throw new BadRequestException(
        'An approved hard policy and configured deadline are required',
      );
    return this.db.transaction(async (m) => {
      const existing = await m.findOneBy(EvaluationDeadlineException, {
        companyId: row.companyId,
        evaluationId: id,
        stage: dto.stage,
      });
      if (existing)
        throw new ConflictException('Deadline exception already exists');
      const granted = await m.save(
        EvaluationDeadlineException,
        m.create(EvaluationDeadlineException, {
          companyId: row.companyId,
          evaluationId: id,
          stage: dto.stage,
          reason: dto.reason.trim(),
          approvedBy: actor.id,
        }),
      );
      await this.event(m, actor, row, 'deadline_exception_granted', {
        stage: dto.stage,
        reason: dto.reason.trim(),
        exceptionId: granted.id,
      });
      return granted;
    });
  }
  async reassignHrReviewer(
    actor: AuthenticatedUser,
    id: number,
    dto: EvaluationReviewerDto,
  ) {
    this.admin(actor);
    const { row } = await this.row(actor, id);
    if (['approved', 'finalized', 'cancelled'].includes(row.status))
      throw new ConflictException('Review is already complete');
    const reviewerId = await this.hrReviewer(
      row.companyId,
      dto.companyUserId,
      row.employeeId,
    );
    const changed = await this.locked(
      actor,
      id,
      row.rowVersion,
      async (m, current) => {
        const previousReviewerCompanyUserId = current.hrReviewerCompanyUserId;
        current.hrReviewerCompanyUserId = reviewerId;
        await this.event(m, actor, current, 'hr_reviewer_reassigned', {
          previousReviewerCompanyUserId,
          reviewerId,
          reason: dto.reason.trim(),
        });
      },
    );
    if (['manager_submitted', 'hr_reviewed'].includes(changed.status))
      await this.refreshInbox(changed, 'hr');
    return changed;
  }
  async cycleStatus(
    actor: AuthenticatedUser,
    id: number,
    status: EvaluationCycle['status'],
  ) {
    this.admin(actor);
    const companyId = this.company(actor);
    const cycle = await this.db
      .getRepository(EvaluationCycle)
      .findOneBy({ id, companyId });
    if (!cycle) throw new NotFoundException('Cycle not found');
    const next: Record<string, string[]> = {
      draft: ['open'],
      open: ['in_progress', 'closed'],
      in_progress: ['review', 'closed'],
      review: ['closed'],
      closed: [],
    };
    if (!next[cycle.status].includes(status))
      throw new ConflictException('Invalid cycle transition');
    if (status === 'closed') {
      const unfinished = await this.db
        .getRepository(PerformanceEvaluation)
        .createQueryBuilder('e')
        .where(
          'e.cycleId = :id AND e.companyId = :companyId AND e.status NOT IN (:...complete)',
          { id, companyId, complete: ['finalized', 'cancelled'] },
        )
        .getCount();
      if (unfinished)
        throw new ConflictException('Cycle has unfinished evaluations');
    }
    cycle.status = status;
    return this.db.getRepository(EvaluationCycle).save(cycle);
  }
  private async event(
    m: EntityManager,
    actor: AuthenticatedUser,
    row: PerformanceEvaluation,
    action: string,
    details: Record<string, unknown> = {},
  ) {
    await m.save(
      EvaluationEvent,
      m.create(EvaluationEvent, {
        companyId: row.companyId,
        evaluationId: row.id,
        action,
        actorId: actor.id,
        details,
      }),
    );
  }
  private async revision(
    m: EntityManager,
    actor: AuthenticatedUser,
    row: PerformanceEvaluation,
    section: EvaluationRevision['section'],
    data: Record<string, unknown>,
  ) {
    const latest = await m.findOne(EvaluationRevision, {
      where: { evaluationId: row.id, section },
      order: { revision: 'DESC' },
    });
    await m.save(
      EvaluationRevision,
      m.create(EvaluationRevision, {
        companyId: row.companyId,
        evaluationId: row.id,
        section,
        revision: (latest?.revision ?? 0) + 1,
        data,
        createdBy: actor.id,
      }),
    );
  }
  async enroll(
    actor: AuthenticatedUser,
    cycleId: number,
    dto: EvaluationEnrollDto,
  ) {
    this.admin(actor);
    const companyId = this.company(actor);
    const cycle = await this.db
      .getRepository(EvaluationCycle)
      .findOneBy({ id: cycleId, companyId });
    if (!cycle || !['open', 'in_progress'].includes(cycle.status))
      throw new ConflictException('Open cycle required');
    const employee = await this.employee(actor, dto.employeeId),
      manager = await this.employee(actor, dto.managerEmployeeId);
    if (employee.id === manager.id || employee.reports_to !== manager.id)
      throw new ForbiddenException(
        'Reviewer must be the current responsible manager',
      );
    const card = await this.db
      .getRepository(Scorecard)
      .findOneBy({ id: dto.scorecardId, companyId });
    if (
      !card ||
      card.subjectType !== 'employee' ||
      card.subjectId !== employee.id ||
      card.periodId !== cycle.periodId ||
      !['published', 'active'].includes(card.status)
    )
      throw new BadRequestException(
        'Matching published personal scorecard required',
      );
    await this.scorecards.get(actor, card.id);
    const enrolled = await this.db.transaction(async (m) => {
      const row = await m.save(
        PerformanceEvaluation,
        m.create(PerformanceEvaluation, {
          companyId,
          cycleId,
          employeeId: employee.id,
          managerEmployeeId: manager.id,
          scorecardId: card.id,
          templateVersionId: cycle.templateVersionId,
          organizationSnapshot: {
            departmentId: employee.primary_department_id,
            branchId: employee.primary_branch_id,
            positionId: employee.primary_position_id,
            managerEmployeeId: manager.id,
          },
          status: 'self_draft',
          hrReviewerCompanyUserId: cycle.hrReviewerCompanyUserId ?? null,
          rowVersion: 1,
          createdBy: actor.id,
        }),
      );
      await this.event(m, actor, row, 'assigned');
      return row;
    });
    await this.refreshInbox(enrolled, 'self');
    return enrolled;
  }
  private async visible(actor: AuthenticatedUser, row: PerformanceEvaluation) {
    if (row.companyId !== this.company(actor))
      throw new NotFoundException('Evaluation not found');
    if (actor.employeeId === row.employeeId) return 'employee';
    if (
      admins.some((r) => actor.roles.includes(r)) &&
      this.access.hasCompanyScope(actor)
    )
      return 'hr';
    if (
      actor.employeeId === row.managerEmployeeId &&
      managers.some((r) => actor.roles.includes(r))
    ) {
      const employee = await this.employee(actor, row.employeeId);
      await this.access.assertCanAccessEmployee(actor, employee);
      return 'manager';
    }
    throw new NotFoundException('Evaluation not found');
  }
  private async row(actor: AuthenticatedUser, id: number) {
    const row = await this.db
      .getRepository(PerformanceEvaluation)
      .findOneBy({ id, companyId: this.company(actor) });
    if (!row) throw new NotFoundException('Evaluation not found');
    const role = await this.visible(actor, row);
    return { row, role };
  }
  async list(actor: AuthenticatedUser) {
    const companyId = this.company(actor);
    let rows: PerformanceEvaluation[];
    if (
      admins.some((r) => actor.roles.includes(r)) &&
      this.access.hasCompanyScope(actor)
    )
      rows = await this.db
        .getRepository(PerformanceEvaluation)
        .find({ where: { companyId }, order: { id: 'DESC' } });
    else if (managers.some((r) => actor.roles.includes(r)) && actor.employeeId)
      rows = await this.db.getRepository(PerformanceEvaluation).find({
        where: [
          { companyId, managerEmployeeId: actor.employeeId },
          { companyId, employeeId: actor.employeeId },
        ],
        order: { id: 'DESC' },
      });
    else if (actor.roles.includes('EMPLOYEE') && actor.employeeId)
      rows = await this.db.getRepository(PerformanceEvaluation).find({
        where: { companyId, employeeId: actor.employeeId },
        order: { id: 'DESC' },
      });
    else throw new ForbiddenException('Appraisal access denied');
    const visible: PerformanceEvaluation[] = [];
    for (const row of rows) {
      try {
        await this.visible(actor, row);
        visible.push(row);
      } catch (error) {
        if (
          !(error instanceof NotFoundException) &&
          !(error instanceof ForbiddenException)
        )
          throw error;
      }
    }
    return visible.map((row) =>
      actor.employeeId === row.employeeId &&
      !['manager_submitted', 'hr_reviewed', 'approved', 'finalized'].includes(
        row.status,
      )
        ? { ...row, managerData: null, hrComment: null, finalSnapshot: null }
        : row,
    );
  }
  async mine(actor: AuthenticatedUser) {
    if (!actor.employeeId)
      throw new ForbiddenException('Employee identity required');
    const rows = await this.db.getRepository(PerformanceEvaluation).find({
      where: { companyId: this.company(actor), employeeId: actor.employeeId },
      order: { id: 'DESC' },
    });
    return rows.map((row) =>
      !['manager_submitted', 'hr_reviewed', 'approved', 'finalized'].includes(
        row.status,
      )
        ? { ...row, managerData: null, hrComment: null, finalSnapshot: null }
        : row,
    );
  }
  async get(actor: AuthenticatedUser, id: number) {
    const { row, role } = await this.row(actor, id);
    const [cycle, template, revisions, history, scorecard] = await Promise.all([
      this.db
        .getRepository(EvaluationCycle)
        .findOneBy({ id: row.cycleId, companyId: row.companyId }),
      this.db
        .getRepository(EvaluationTemplateVersion)
        .findOneBy({ id: row.templateVersionId, companyId: row.companyId }),
      this.db.getRepository(EvaluationRevision).find({
        where: { evaluationId: id, companyId: row.companyId },
        order: { id: 'ASC' },
      }),
      this.db.getRepository(EvaluationEvent).find({
        where: { evaluationId: id, companyId: row.companyId },
        order: { id: 'ASC' },
      }),
      row.finalSnapshot
        ? Promise.resolve(null)
        : this.scorecards.get(actor, row.scorecardId),
    ]);
    const activeStage = ['self_draft', 'self_returned'].includes(row.status)
      ? 'self'
      : ['self_submitted', 'manager_draft'].includes(row.status)
        ? 'manager'
        : ['manager_submitted', 'hr_reviewed'].includes(row.status) &&
            template?.config.requireHrReview
          ? 'hr'
          : row.status === 'finalized' && !row.ackStatus
            ? 'ack'
            : null;
    const dueDate =
      activeStage === 'self'
        ? cycle?.selfDeadline
        : activeStage === 'manager'
          ? cycle?.managerDeadline
          : activeStage === 'hr'
            ? cycle?.hrDeadline
            : activeStage === 'ack'
              ? cycle?.ackDeadline
              : null;
    const company = dueDate
      ? await this.db.getRepository(Company).findOneBy({ id: row.companyId })
      : null;
    const zone =
      typeof company?.metadata?.timezone === 'string'
        ? company.metadata.timezone
        : 'UTC';
    const parts = dueDate
      ? new Intl.DateTimeFormat('en-CA', {
          timeZone: zone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(new Date())
      : [];
    const value = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? '';
    const today = dueDate
      ? `${value('year')}-${value('month')}-${value('day')}`
      : null;
    // Confidential manager drafts remain invisible to employees until submitted.
    return {
      ...row,
      cycle,
      deadlineInfo: {
        stage: activeStage,
        dueDate,
        overdue: !!dueDate && !!today && today > dueDate,
        mode: cycle?.deadlinePolicy?.mode ?? 'soft',
      },
      templateVersion: template,
      revisions:
        role === 'employee'
          ? revisions.filter(
              (r) => r.section === 'self' || row.status === 'finalized',
            )
          : revisions,
      history,
      scorecard: row.finalSnapshot ? row.finalSnapshot.scorecard : scorecard,
      managerData:
        role === 'employee' &&
        !['manager_submitted', 'hr_reviewed', 'approved', 'finalized'].includes(
          row.status,
        )
          ? null
          : row.managerData,
    };
  }
  private async locked(
    actor: AuthenticatedUser,
    id: number,
    expected: number,
    fn: (m: EntityManager, row: PerformanceEvaluation) => Promise<void>,
  ) {
    await this.row(actor, id);
    await this.db.transaction(async (m) => {
      const row = await m.findOne(PerformanceEvaluation, {
        where: { id, companyId: this.company(actor) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.rowVersion !== expected)
        throw new ConflictException('Evaluation changed; reload');
      await fn(m, row);
      row.rowVersion++;
      await m.save(row);
    });
    return this.get(actor, id);
  }
  async saveSelf(actor: AuthenticatedUser, id: number, dto: SelfAssessmentDto) {
    const { row, role } = await this.row(actor, id);
    if (role !== 'employee')
      throw new ForbiddenException('Employee self-assessment only');
    if (!['self_draft', 'self_returned'].includes(row.status))
      throw new ConflictException('Self-assessment is read-only');
    const template = await this.db
      .getRepository(EvaluationTemplateVersion)
      .findOneByOrFail({ id: row.templateVersionId });
    this.validateRatings(dto.competencyRatings ?? {}, template, false);
    return this.locked(actor, id, dto.rowVersion, async (m, current) => {
      if (!['self_draft', 'self_returned'].includes(current.status))
        throw new ConflictException('Self-assessment is read-only');
      const { rowVersion: _rowVersion, ...data } = dto;
      void _rowVersion;
      current.selfData = data;
      await this.revision(m, actor, current, 'self', data);
      await this.event(m, actor, current, 'self_saved');
    });
  }
  async submitSelf(
    actor: AuthenticatedUser,
    id: number,
    dto: EvaluationActionDto,
  ) {
    const { role } = await this.row(actor, id);
    if (role !== 'employee')
      throw new ForbiddenException('Employee self-assessment only');
    const submitted = await this.locked(
      actor,
      id,
      dto.rowVersion,
      async (m, current) => {
        if (
          !['self_draft', 'self_returned'].includes(current.status) ||
          !current.selfData
        )
          throw new ConflictException('Saved self-assessment required');
        const timing = await this.deadlineState(current, 'self');
        current.status = 'self_submitted';
        await this.event(m, actor, current, 'self_submitted', {
          late: timing.late,
          submittedAt: new Date().toISOString(),
          exceptionId: timing.exception?.id ?? null,
        });
      },
    );
    await this.refreshInbox(submitted, 'manager');
    return submitted;
  }
  private validateRatings(
    ratings: Record<string, number>,
    template: EvaluationTemplateVersion,
    required: boolean,
  ) {
    const competencies = template.config.competencies,
      allowed = new Set(template.config.scale.map((s) => s.value));
    if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings))
      throw new BadRequestException('Competency ratings must be an object');
    for (const [code, value] of Object.entries(ratings))
      if (!competencies.some((c) => c.code === code) || !allowed.has(value))
        throw new BadRequestException('Invalid competency rating');
    if (required && competencies.some((c) => ratings[c.code] === undefined))
      throw new BadRequestException(
        'Every configured competency requires a rating',
      );
  }
  async saveManager(
    actor: AuthenticatedUser,
    id: number,
    dto: ManagerAssessmentDto,
  ) {
    const { row, role } = await this.row(actor, id);
    if (role !== 'manager')
      throw new ForbiddenException('Assigned manager required');
    const template = await this.db
      .getRepository(EvaluationTemplateVersion)
      .findOneByOrFail({ id: row.templateVersionId });
    this.validateRatings(dto.competencyRatings, template, true);
    return this.locked(actor, id, dto.rowVersion, async (m, current) => {
      if (!['self_submitted', 'manager_draft'].includes(current.status))
        throw new ConflictException('Manager assessment is read-only');
      const { rowVersion: _rowVersion, ...data } = dto;
      void _rowVersion;
      current.managerData = data;
      current.status = 'manager_draft';
      await this.revision(m, actor, current, 'manager', data);
      await this.event(m, actor, current, 'manager_saved');
    });
  }
  async managerAction(
    actor: AuthenticatedUser,
    id: number,
    action: 'submit' | 'return',
    dto: EvaluationActionDto,
  ) {
    const { role } = await this.row(actor, id);
    if (role !== 'manager')
      throw new ForbiddenException('Assigned manager required');
    const result = await this.locked(
      actor,
      id,
      dto.rowVersion,
      async (m, row) => {
        if (action === 'return') {
          if (
            !['self_submitted', 'manager_draft'].includes(row.status) ||
            !dto.comment?.trim()
          )
            throw new BadRequestException(
              'Return requires a reason and submitted self-assessment',
            );
          row.status = 'self_returned';
          row.managerData = null;
        } else {
          if (row.status !== 'manager_draft' || !row.managerData)
            throw new ConflictException(
              'Completed manager assessment required',
            );
          const timing = await this.deadlineState(row, 'manager');
          const cycle = await m.findOneByOrFail(EvaluationCycle, {
            id: row.cycleId,
            companyId: row.companyId,
          });
          const template = await m.findOneByOrFail(EvaluationTemplateVersion, {
            id: row.templateVersionId,
            companyId: row.companyId,
          });
          if (template.config.requireHrReview)
            row.hrReviewerCompanyUserId = await this.hrReviewer(
              row.companyId,
              row.hrReviewerCompanyUserId ?? cycle.hrReviewerCompanyUserId,
              row.employeeId,
            );
          row.status = 'manager_submitted';
          await this.event(m, actor, row, 'manager_deadline_recorded', {
            late: timing.late,
            submittedAt: new Date().toISOString(),
            exceptionId: timing.exception?.id ?? null,
          });
        }
        await this.event(
          m,
          actor,
          row,
          action === 'return' ? 'self_returned' : 'manager_submitted',
          { comment: dto.comment?.trim() ?? null },
        );
      },
    );
    await this.refreshInbox(
      result,
      action === 'return'
        ? 'self'
        : result.hrReviewerCompanyUserId
          ? 'hr'
          : null,
    );
    return result;
  }
  async hrAction(
    actor: AuthenticatedUser,
    id: number,
    action: 'review' | 'approve' | 'return',
    dto: EvaluationActionDto,
  ) {
    this.admin(actor);
    const { row: subject } = await this.row(actor, id);
    if (actor.employeeId === subject.employeeId)
      throw new ForbiddenException('Self review is forbidden');
    if (
      subject.hrReviewerCompanyUserId &&
      actor.companyMembershipId !== subject.hrReviewerCompanyUserId &&
      !actor.roles.includes('COMPANY_ADMIN')
    )
      throw new ForbiddenException('Assigned HR reviewer required');
    const result = await this.locked(
      actor,
      id,
      dto.rowVersion,
      async (m, row) => {
        const template = await m.findOneByOrFail(EvaluationTemplateVersion, {
          id: row.templateVersionId,
          companyId: row.companyId,
        });
        if (action === 'return') {
          if (
            !['manager_submitted', 'hr_reviewed'].includes(row.status) ||
            !dto.comment?.trim()
          )
            throw new BadRequestException('HR return requires a reason');
          row.status = 'manager_draft';
        } else if (action === 'review') {
          if (row.status !== 'manager_submitted')
            throw new ConflictException('Manager submission required');
          const timing = await this.deadlineState(row, 'hr');
          await this.event(m, actor, row, 'hr_deadline_recorded', {
            late: timing.late,
            reviewedAt: new Date().toISOString(),
            exceptionId: timing.exception?.id ?? null,
          });
          row.status = 'hr_reviewed';
        } else {
          if (
            row.status !==
            (template.config.requireHrReview
              ? 'hr_reviewed'
              : 'manager_submitted')
          )
            throw new ConflictException(
              'Required HR review or manager submission missing',
            );
          const timing = await this.deadlineState(row, 'hr');
          await this.event(m, actor, row, 'hr_deadline_recorded', {
            late: timing.late,
            approvedAt: new Date().toISOString(),
            exceptionId: timing.exception?.id ?? null,
          });
          row.status = 'approved';
        }
        row.hrComment = dto.comment?.trim() ?? null;
        await this.revision(m, actor, row, 'hr', {
          action,
          comment: row.hrComment,
        });
        await this.event(m, actor, row, `hr_${action}`, {
          comment: row.hrComment,
        });
      },
    );
    await this.refreshInbox(
      result,
      action === 'return' ? 'manager' : action === 'review' ? 'hr' : null,
    );
    if (action === 'approve')
      await this.notifyEmployee(
        result,
        'approved',
        'Performance evaluation approved',
      );
    return result;
  }
  async finalize(
    actor: AuthenticatedUser,
    id: number,
    dto: EvaluationActionDto,
  ) {
    this.admin(actor);
    const { row } = await this.row(actor, id);
    if (actor.employeeId === row.employeeId)
      throw new ForbiddenException('Self finalization is forbidden');
    if (row.status !== 'approved')
      throw new ConflictException('Approved evaluation required');
    const live = await this.scorecards.get(actor, row.scorecardId);
    if (
      !live.currentVersion?.publishedAt ||
      live.period?.id !==
        (
          await this.db
            .getRepository(EvaluationCycle)
            .findOneByOrFail({ id: row.cycleId })
        ).periodId ||
      live.overallScore === null ||
      live.entries.some((entry) => entry.required && entry.status !== 'scored')
    )
      throw new ConflictException(
        'Approved, complete KPI scorecard required before finalization',
      );
    // Resolve again while holding the evaluation row lock, then store a frozen copy.
    const finalized = await this.locked(
      actor,
      id,
      dto.rowVersion,
      async (m, current) => {
        if (current.status !== 'approved')
          throw new ConflictException('Evaluation changed');
        const fresh = await this.scorecards.get(actor, current.scorecardId);
        if (
          fresh.overallScore === null ||
          fresh.entries.some(
            (entry) => entry.required && entry.status !== 'scored',
          )
        )
          throw new ConflictException('KPI scorecard became incomplete');
        current.finalSnapshot = {
          scorecard: fresh,
          scorecardVersionId: fresh.currentVersion.id,
          policyVersionId: fresh.scoringPolicyVersion?.id ?? null,
          templateVersionId: current.templateVersionId,
          selfData: current.selfData,
          managerData: current.managerData,
          hrComment: current.hrComment,
          finalizedBy: actor.id,
          finalizedAt: new Date().toISOString(),
          competencyResult: current.managerData?.competencyRatings ?? null,
          compositeRating: null,
        };
        current.status = 'finalized';
        current.finalizedAt = new Date();
        await this.event(m, actor, current, 'finalized', {
          scorecardVersionId: fresh.currentVersion.id,
          score: fresh.overallScore,
        });
      },
    );
    await this.refreshInbox(finalized, 'ack');
    await this.notifyEmployee(
      finalized,
      'finalized',
      'Performance evaluation finalized',
    );
    return finalized;
  }
  async acknowledge(
    actor: AuthenticatedUser,
    id: number,
    dto: EvaluationAckDto,
  ) {
    const { row, role } = await this.row(actor, id);
    if (role !== 'employee')
      throw new ForbiddenException('Employee acknowledgement only');
    if (row.status !== 'finalized' || row.ackStatus)
      throw new ConflictException(
        'Finalized, unacknowledged evaluation required',
      );
    const acknowledged = await this.locked(
      actor,
      id,
      row.rowVersion,
      async (m, current) => {
        if (current.status !== 'finalized' || current.ackStatus)
          throw new ConflictException('Acknowledgement already recorded');
        const timing = await this.deadlineState(current, 'ack');
        current.ackStatus = dto.status;
        current.ackComment = dto.comment?.trim() ?? null;
        current.ackAt = new Date();
        await this.event(m, actor, current, dto.status, {
          comment: current.ackComment,
          late: timing.late,
          acknowledgedAt: new Date().toISOString(),
          exceptionId: timing.exception?.id ?? null,
        });
      },
    );
    await this.refreshInbox(acknowledged, null);
    return acknowledged;
  }
  async amend(actor: AuthenticatedUser, id: number, reason: string) {
    this.admin(actor);
    if (!reason?.trim())
      throw new BadRequestException('Amendment reason required');
    const { row } = await this.row(actor, id);
    if (actor.employeeId === row.employeeId)
      throw new ForbiddenException('Self amendment is forbidden');
    if (row.status !== 'finalized')
      throw new ConflictException('Only finalized evaluations can be amended');
    const amendment = await this.db.transaction(async (m) => {
      const copy = await m.save(
        PerformanceEvaluation,
        m.create(PerformanceEvaluation, {
          companyId: row.companyId,
          cycleId: row.cycleId,
          employeeId: row.employeeId,
          managerEmployeeId: row.managerEmployeeId,
          scorecardId: row.scorecardId,
          templateVersionId: row.templateVersionId,
          organizationSnapshot: row.organizationSnapshot,
          amendedFromId: row.id,
          status: 'self_draft',
          rowVersion: 1,
          selfData: row.selfData,
          managerData: null,
          createdBy: actor.id,
        }),
      );
      await this.event(m, actor, copy, 'amendment_opened', {
        originalEvaluationId: row.id,
        reason: reason.trim(),
      });
      return copy;
    });
    await this.refreshInbox(amendment, 'self');
    return amendment;
  }
  async cancel(actor: AuthenticatedUser, id: number, dto: EvaluationActionDto) {
    this.admin(actor);
    const { row: subject } = await this.row(actor, id);
    if (actor.employeeId === subject.employeeId)
      throw new ForbiddenException('Self cancellation is forbidden');
    if (!dto.comment?.trim())
      throw new BadRequestException('Cancellation reason required');
    const result = await this.locked(
      actor,
      id,
      dto.rowVersion,
      async (m, row) => {
        if (['finalized', 'cancelled'].includes(row.status))
          throw new ConflictException(
            'Finalized or cancelled evaluation cannot be cancelled',
          );
        row.status = 'cancelled';
        await this.event(m, actor, row, 'cancelled', {
          reason: dto.comment!.trim(),
        });
      },
    );
    await this.refreshInbox(result, null);
    return result;
  }
  async reassignManager(
    actor: AuthenticatedUser,
    id: number,
    managerEmployeeId: number,
    reason: string,
  ) {
    this.admin(actor);
    if (!reason?.trim())
      throw new BadRequestException('Reassignment reason required');
    const { row } = await this.row(actor, id);
    if (actor.employeeId === row.employeeId)
      throw new ForbiddenException('Self reassignment is forbidden');
    if (['approved', 'finalized', 'cancelled'].includes(row.status))
      throw new ConflictException('Approved evaluation cannot be reassigned');
    const manager = await this.employee(actor, managerEmployeeId);
    if (manager.id === row.employeeId)
      throw new BadRequestException('Self review is forbidden');
    const reassigned = await this.locked(
      actor,
      id,
      row.rowVersion,
      async (m, current) => {
        const previous = current.managerEmployeeId;
        current.managerEmployeeId = manager.id;
        await this.event(m, actor, current, 'manager_reassigned', {
          previousManagerId: previous,
          managerEmployeeId,
          reason: reason.trim(),
        });
      },
    );
    if (['self_submitted', 'manager_draft'].includes(reassigned.status))
      await this.refreshInbox(reassigned, 'manager');
    return reassigned;
  }
  async dashboard(actor: AuthenticatedUser) {
    const rows = await this.list(actor);
    const total = rows.length;
    const company = await this.db
      .getRepository(Company)
      .findOneBy({ id: this.company(actor) });
    const zone =
      typeof company?.metadata?.timezone === 'string'
        ? company.metadata.timezone
        : 'UTC';
    let today: string;
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      const value = (type: string) =>
        parts.find((part) => part.type === type)?.value ?? '';
      today = `${value('year')}-${value('month')}-${value('day')}`;
    } catch {
      today = new Date().toISOString().slice(0, 10);
    }
    const cycles = await this.db
      .getRepository(EvaluationCycle)
      .findBy({ companyId: this.company(actor) });
    const cycleById = new Map(cycles.map((cycle) => [cycle.id, cycle]));
    const overdue = rows.filter((row) => {
      const cycle = cycleById.get(row.cycleId);
      if (!cycle || ['finalized', 'cancelled'].includes(row.status))
        return false;
      const deadline = ['self_draft', 'self_returned'].includes(row.status)
        ? cycle.selfDeadline
        : ['self_submitted', 'manager_draft'].includes(row.status)
          ? cycle.managerDeadline
          : cycle.hrDeadline;
      return !!deadline && deadline < today;
    }).length;
    const ratingDistribution: Record<string, number> = {};
    for (const row of rows) {
      const scorecard = row.finalSnapshot?.scorecard as
        | { rating?: string | null }
        | undefined;
      if (row.status === 'finalized' && scorecard?.rating)
        ratingDistribution[scorecard.rating] =
          (ratingDistribution[scorecard.rating] ?? 0) + 1;
    }
    return {
      total,
      activeCycles: cycles.filter(
        (cycle) => cycle.status !== 'draft' && cycle.status !== 'closed',
      ).length,
      overdue,
      ratingDistribution,
      finalized: rows.filter((r) => r.status === 'finalized').length,
      pendingSelf: rows.filter((r) =>
        ['self_draft', 'self_returned'].includes(r.status),
      ).length,
      pendingManager: rows.filter((r) =>
        ['self_submitted', 'manager_draft'].includes(r.status),
      ).length,
      pendingHr: rows.filter((r) =>
        ['manager_submitted', 'hr_reviewed', 'approved'].includes(r.status),
      ).length,
      completionPercent: total
        ? Math.round(
            (rows.filter((r) => r.status === 'finalized').length * 10000) /
              total,
          ) / 100
        : 0,
    };
  }
}
