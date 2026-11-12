import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../shared/hr-access.service';
import {
  KpiAssignment,
  KpiDefinitionVersion,
  KpiPeriod,
  KpiTargetRevision,
} from './kpi.entities';
import { KpiService } from './kpi.service';
import { KpiAchievement, KpiAchievementRevision } from './achievement.entities';
import {
  CloneDto,
  PolicyDraftDto,
  PolicyDto,
  PreviewDto,
  ScorecardCreateDto,
  ScorecardDraftDto,
  ScorecardTemplateDto,
  UseScorecardTemplateDto,
} from './dto/scorecard.dto';
import {
  DEFAULT_RATING_BANDS,
  DEFAULT_SCORING_CONFIG,
  previewScorecard,
  ScoringConfig,
  validateScoringConfig,
  validateWeights,
} from './scorecard-scoring';
import {
  Scorecard,
  ScorecardEntryConfig,
  ScorecardSubject,
  ScorecardTemplate,
  ScorecardVersion,
  ScoringPolicy,
  ScoringPolicyVersion,
} from './scorecard.entities';

const administrators = ['COMPANY_ADMIN', 'HR_MANAGER'];
const managers = [...administrators, 'DEPARTMENT_MANAGER', 'BRANCH_MANAGER'];
const readers = [...managers, 'MANAGEMENT'];
type ScorecardLookup = {
  versions: Map<number, ScorecardVersion[]>;
  definitions: Map<number, KpiDefinitionVersion>;
  targets: Map<number, KpiTargetRevision>;
  assignments: Map<number, KpiAssignment>;
  policies: Map<number, ScoringPolicyVersion>;
  periods: Map<number, KpiPeriod>;
  roots: Map<number, KpiAchievement>;
  approved: Map<number, KpiAchievementRevision>;
};

@Injectable()
export class ScorecardService {
  constructor(
    private readonly db: DataSource,
    @InjectRepository(Scorecard)
    private readonly scorecards: Repository<Scorecard>,
    @InjectRepository(ScorecardVersion)
    private readonly versions: Repository<ScorecardVersion>,
    @InjectRepository(ScoringPolicy)
    private readonly policies: Repository<ScoringPolicy>,
    @InjectRepository(ScoringPolicyVersion)
    private readonly policyVersions: Repository<ScoringPolicyVersion>,
    @InjectRepository(ScorecardTemplate)
    private readonly templates: Repository<ScorecardTemplate>,
    @InjectRepository(KpiAssignment)
    private readonly assignments: Repository<KpiAssignment>,
    @InjectRepository(KpiDefinitionVersion)
    private readonly definitions: Repository<KpiDefinitionVersion>,
    @InjectRepository(KpiTargetRevision)
    private readonly targets: Repository<KpiTargetRevision>,
    @InjectRepository(KpiPeriod)
    private readonly periods: Repository<KpiPeriod>,
    private readonly kpi: KpiService,
    private readonly access: HrAccessService,
  ) {}

  private company(actor: AuthenticatedUser) {
    return this.access.ensureActorCompanyId(actor);
  }
  private role(actor: AuthenticatedUser, allowed: string[]) {
    if (!allowed.some((role) => actor.roles.includes(role)))
      throw new ForbiddenException('Scorecard access denied');
  }
  private administrator(actor: AuthenticatedUser) {
    this.role(actor, administrators);
    if (!this.access.hasCompanyScope(actor))
      throw new ForbiddenException('Company scoring policy scope required');
  }
  private async subject(
    actor: AuthenticatedUser,
    type: ScorecardSubject,
    id: number,
  ) {
    const companyId = this.company(actor);
    if (type === 'organization') {
      if (
        id !== companyId ||
        !this.access.hasCompanyScope(actor) ||
        !actor.roles.some((r) => [...administrators, 'MANAGEMENT'].includes(r))
      )
        throw new ForbiddenException(
          'Organization scorecard requires authorized company scope',
        );
      return { companyId };
    }
    return this.kpi.scorecardSubject(actor, type, id);
  }
  private code(value: string) {
    const code = value?.trim().toUpperCase();
    if (!code || !/^[A-Z][A-Z0-9_-]{1,79}$/.test(code))
      throw new BadRequestException(
        'Scorecard identifier must use 2–80 letters, digits, _ or -',
      );
    return code;
  }
  private async period(companyId: number, id: number) {
    const period = await this.periods.findOneBy({ id, companyId });
    if (!period)
      throw new BadRequestException(
        'Reporting period is outside the active company',
      );
    return period;
  }
  private async publishedPolicy(actor: AuthenticatedUser, id?: number) {
    if (!id) return null;
    const policy = await this.policyVersions.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!policy?.publishedAt)
      throw new BadRequestException(
        'Published scoring policy version required',
      );
    return policy;
  }
  private async entries(
    actor: AuthenticatedUser,
    subjectType: ScorecardSubject,
    subjectId: number,
    periodId: number,
    input: ScorecardDraftDto['entries'],
  ): Promise<ScorecardEntryConfig[]> {
    if (!Array.isArray(input) || input.length === 0 || input.length > 100)
      throw new BadRequestException('Select 1–100 KPI assignments');
    if (new Set(input.map((item) => item.assignmentId)).size !== input.length)
      throw new BadRequestException('Duplicate KPI assignment in scorecard');
    const result: ScorecardEntryConfig[] = [];
    for (const item of input) {
      const assignment = await this.kpi.getAssignment(actor, item.assignmentId);
      if (assignment.status !== 'active' || assignment.periodId !== periodId)
        throw new BadRequestException(
          'KPI assignment must be active in the scorecard period',
        );
      if (
        subjectType !== 'organization' &&
        (assignment.subjectType !== subjectType ||
          assignment.subjectId !== subjectId)
      )
        throw new BadRequestException(
          'KPI assignment does not belong to scorecard subject',
        );
      if (
        !assignment.definitionVersion?.publishedAt ||
        !assignment.currentTarget
      )
        throw new BadRequestException(
          'KPI assignment requires a published definition and target',
        );
      result.push({
        assignmentId: assignment.id,
        definitionVersionId: assignment.definitionVersionId,
        targetRevisionId: assignment.currentTarget.id,
        weight: String(item.weight),
        required: item.required !== false,
      });
    }
    return result;
  }
  private async latestVersion(scorecardId: number) {
    const version = await this.versions.findOne({
      where: { scorecardId },
      order: { version: 'DESC' },
    });
    if (!version) throw new NotFoundException('Scorecard version missing');
    return version;
  }
  private async latestPolicyVersion(policyId: number) {
    const version = await this.policyVersions.findOne({
      where: { policyId },
      order: { version: 'DESC' },
    });
    if (!version) throw new NotFoundException('Scoring policy version missing');
    return version;
  }
  private async visible(
    actor: AuthenticatedUser,
    scorecard: Scorecard,
    write = false,
  ) {
    if (scorecard.companyId !== this.company(actor))
      throw new NotFoundException('Scorecard not found');
    if (
      actor.roles.includes('EMPLOYEE') &&
      !actor.roles.some((r) => readers.includes(r))
    ) {
      if (
        write ||
        scorecard.subjectType !== 'employee' ||
        scorecard.subjectId !== actor.employeeId ||
        scorecard.status === 'archived'
      )
        throw new ForbiddenException('Personal published scorecards only');
      const versions = await this.versions.find({
        where: { scorecardId: scorecard.id },
        order: { version: 'DESC' },
      });
      if (!versions.some((version) => version.publishedAt))
        throw new ForbiddenException('Personal published scorecards only');
      return;
    }
    this.role(actor, write ? managers : readers);
    if (
      actor.roles.includes('MANAGEMENT') &&
      !actor.roles.some((r) => managers.includes(r))
    ) {
      if (write || !this.access.hasCompanyScope(actor))
        throw new ForbiddenException(
          'Management read-only company scope required',
        );
      throw new ForbiddenException(
        'Scorecard detail requires an approved disclosure policy',
      );
    }
    if (
      actor.roles.some((r) => administrators.includes(r)) &&
      this.access.hasCompanyScope(actor)
    )
      return;
    await this.subject(actor, scorecard.subjectType, scorecard.subjectId);
  }
  private async decorate(
    actor: AuthenticatedUser,
    scorecard: Scorecard,
    personal = false,
    lookup?: ScorecardLookup,
  ) {
    const versions =
      lookup?.versions.get(scorecard.id) ??
      (await this.versions.find({
        where: { scorecardId: scorecard.id, companyId: scorecard.companyId },
        order: { version: 'DESC' },
      }));
    const current = personal
      ? versions.find((v) => v.publishedAt)
      : versions[0];
    if (!current) throw new NotFoundException('Published scorecard not found');
    const entries = await Promise.all(
      current.entries.map(async (entry) => {
        const [definition, target, assignment] = lookup
          ? [
              lookup.definitions.get(entry.definitionVersionId),
              lookup.targets.get(entry.targetRevisionId),
              lookup.assignments.get(entry.assignmentId),
            ]
          : await Promise.all([
              this.definitions.findOneBy({
                id: entry.definitionVersionId,
                companyId: scorecard.companyId,
              }),
              this.targets.findOneBy({
                id: entry.targetRevisionId,
                companyId: scorecard.companyId,
              }),
              this.assignments.findOneBy({
                id: entry.assignmentId,
                companyId: scorecard.companyId,
              }),
            ]);
        return {
          ...entry,
          kpiName: definition?.name ?? 'Unavailable KPI',
          definitionId: definition?.definitionId ?? null,
          measurementType: definition?.measurementType,
          direction: definition?.direction,
          measurementUnit: definition?.measurementUnit,
          target: target?.target ?? null,
          assignmentStatus: assignment?.status ?? 'unavailable',
          actual: null,
          achievement: null,
          weightedScore: null,
          status: 'awaiting_data',
        };
      }),
    );
    const scoringPolicyVersion = current.policyVersionId
      ? (lookup?.policies.get(current.policyVersionId) ??
        (await this.policyVersions.findOneBy({
          id: current.policyVersionId,
          companyId: scorecard.companyId,
        })))
      : null;
    let liveResult: ReturnType<typeof previewScorecard> | null = null;
    if (
      current.publishedAt &&
      scorecard.status !== 'archived' &&
      entries.length
    ) {
      const roots = lookup
        ? current.entries
            .map((entry) => lookup.roots.get(entry.assignmentId))
            .filter((root): root is KpiAchievement => !!root)
        : await this.db.getRepository(KpiAchievement).findBy({
            companyId: scorecard.companyId,
            assignmentId: In(entries.map((entry) => entry.assignmentId)),
          });
      const approved = lookup
        ? Array.from(lookup.approved.values())
        : roots.filter((root) => root.approvedRevisionId).length
          ? await this.db.getRepository(KpiAchievementRevision).findBy({
              companyId: scorecard.companyId,
              id: In(
                roots
                  .map((root) => root.approvedRevisionId)
                  .filter((id): id is number => id !== null),
              ),
            })
          : [];
      const approvedByAssignment = new Map(
        roots.map((root) => [
          root.assignmentId,
          approved.find(
            (revision) =>
              revision.id === root.approvedRevisionId &&
              revision.status === 'approved',
          ),
        ]),
      );
      const inputs = await Promise.all(
        current.entries.map(async (entry) => {
          const [definition, target] = lookup
            ? [
                lookup.definitions.get(entry.definitionVersionId),
                lookup.targets.get(entry.targetRevisionId),
              ]
            : await Promise.all([
                this.definitions.findOneBy({
                  id: entry.definitionVersionId,
                  companyId: scorecard.companyId,
                }),
                this.targets.findOneBy({
                  id: entry.targetRevisionId,
                  companyId: scorecard.companyId,
                }),
              ]);
          if (!definition || !target)
            throw new ConflictException(
              'Historical scorecard KPI definition or target unavailable',
            );
          const approvedRevision = approvedByAssignment.get(entry.assignmentId);
          return {
            entryId: entry.assignmentId,
            weight: entry.weight,
            required: entry.required,
            type: definition.measurementType,
            direction: definition.direction,
            target: target.target,
            actual:
              approvedRevision?.definitionVersionId ===
                entry.definitionVersionId &&
              approvedRevision.periodId === scorecard.periodId
                ? approvedRevision.actual
                : undefined,
          };
        }),
      );
      liveResult = previewScorecard(
        inputs,
        current.mode,
        scoringPolicyVersion
          ? (scoringPolicyVersion.config as unknown as ScoringConfig)
          : DEFAULT_SCORING_CONFIG,
        scoringPolicyVersion?.ratingBands ?? DEFAULT_RATING_BANDS,
      );
      for (const entry of entries) {
        const result = liveResult.entries.find(
          (item) => item.entryId === entry.assignmentId,
        );
        const approvedRevision = approvedByAssignment.get(entry.assignmentId);
        if (
          result &&
          approvedRevision?.definitionVersionId === entry.definitionVersionId &&
          approvedRevision.periodId === scorecard.periodId
        ) {
          entry.actual = approvedRevision.actual as null;
          entry.achievement = result.scoredAchievement as null;
          entry.weightedScore = result.weightedContribution as null;
          entry.status = result.status;
          Object.assign(entry, {
            rawAchievement: result.rawAchievement,
            approvedRevisionId: approvedRevision.id,
            achievementId:
              roots.find((root) => root.assignmentId === entry.assignmentId)
                ?.id ?? null,
            managerFeedback: approvedRevision.reviewComment,
          });
        }
      }
    }
    return {
      ...scorecard,
      currentVersion: current,
      versions: personal ? versions.filter((v) => v.publishedAt) : versions,
      period:
        lookup?.periods.get(scorecard.periodId) ??
        (await this.period(scorecard.companyId, scorecard.periodId)),
      entries,
      scoringPolicyVersion,
      performanceStatus:
        liveResult?.overallScore !== null && liveResult
          ? 'scored'
          : liveResult?.entries.some((entry) => entry.status === 'scored')
            ? 'partial'
            : 'awaiting_data',
      completenessPercent: liveResult?.completenessPercent ?? '0',
      overallScore: liveResult?.overallScore ?? null,
      rating: liveResult?.rating ?? null,
      calculation: liveResult
        ? {
            scorecardVersionId: current.id,
            policyVersionId: scoringPolicyVersion?.id ?? null,
            calculatedAt: new Date().toISOString(),
            finalized: false,
          }
        : null,
    };
  }

  /** Bounded read-only bulk hydration for analytics; calculations still use previewScorecard. */
  async analyticsDetails(actor: AuthenticatedUser, rows: Scorecard[]) {
    if (!rows.length) return [];
    const companyId = this.company(actor);
    if (rows.some((row) => row.companyId !== companyId))
      throw new ForbiddenException('Scorecard outside active company');
    await Promise.all(rows.map((row) => this.visible(actor, row)));
    const personal =
      actor.roles.includes('EMPLOYEE') &&
      !actor.roles.some((role) => readers.includes(role));
    const versions = await this.versions.find({
      where: { companyId, scorecardId: In(rows.map((row) => row.id)) },
      order: { version: 'DESC' },
    });
    const versionMap = new Map<number, ScorecardVersion[]>();
    for (const version of versions) {
      const group = versionMap.get(version.scorecardId) ?? [];
      group.push(version);
      versionMap.set(version.scorecardId, group);
    }
    const currentVersions = rows.map((row) => {
      const group = versionMap.get(row.id) ?? [];
      const current = personal
        ? group.find((version) => version.publishedAt)
        : group[0];
      if (!current)
        throw new NotFoundException('Published scorecard not found');
      return current;
    });
    const entries = currentVersions.flatMap((version) => version.entries);
    const ids = (values: number[]) => Array.from(new Set(values));
    const definitionIds = ids(
      entries.map((entry) => entry.definitionVersionId),
    );
    const targetIds = ids(entries.map((entry) => entry.targetRevisionId));
    const assignmentIds = ids(entries.map((entry) => entry.assignmentId));
    const policyIds = ids(
      currentVersions
        .map((version) => version.policyVersionId)
        .filter((id): id is number => id !== null),
    );
    const periodIds = ids(rows.map((row) => row.periodId));
    const definitionsQuery: Promise<KpiDefinitionVersion[]> =
      definitionIds.length
        ? this.definitions.findBy({ companyId, id: In(definitionIds) })
        : Promise.resolve([]);
    const targetsQuery: Promise<KpiTargetRevision[]> = targetIds.length
      ? this.targets.findBy({ companyId, id: In(targetIds) })
      : Promise.resolve([]);
    const assignmentsQuery: Promise<KpiAssignment[]> = assignmentIds.length
      ? this.assignments.findBy({ companyId, id: In(assignmentIds) })
      : Promise.resolve([]);
    const policiesQuery: Promise<ScoringPolicyVersion[]> = policyIds.length
      ? this.policyVersions.findBy({ companyId, id: In(policyIds) })
      : Promise.resolve([]);
    const rootsQuery: Promise<KpiAchievement[]> = assignmentIds.length
      ? this.db
          .getRepository(KpiAchievement)
          .findBy({ companyId, assignmentId: In(assignmentIds) })
      : Promise.resolve([]);
    const [definitions, targets, assignments, policies, periods, roots] =
      await Promise.all([
        definitionsQuery,
        targetsQuery,
        assignmentsQuery,
        policiesQuery,
        this.periods.findBy({ companyId, id: In(periodIds) }),
        rootsQuery,
      ]);
    const approvedIds = ids(
      roots
        .map((root) => root.approvedRevisionId)
        .filter((id): id is number => id !== null),
    );
    const approved = approvedIds.length
      ? await this.db
          .getRepository(KpiAchievementRevision)
          .findBy({ companyId, id: In(approvedIds) })
      : [];
    const lookup: ScorecardLookup = {
      versions: versionMap,
      definitions: new Map(definitions.map((row) => [row.id, row] as const)),
      targets: new Map(targets.map((row) => [row.id, row] as const)),
      assignments: new Map(assignments.map((row) => [row.id, row] as const)),
      policies: new Map(policies.map((row) => [row.id, row] as const)),
      periods: new Map(periods.map((row) => [row.id, row] as const)),
      roots: new Map(roots.map((row) => [row.assignmentId, row] as const)),
      approved: new Map(approved.map((row) => [row.id, row] as const)),
    };
    return Promise.all(
      rows.map((row) => this.decorate(actor, row, personal, lookup)),
    );
  }

  async list(actor: AuthenticatedUser) {
    const companyId = this.company(actor);
    const rows = await this.scorecards.find({
      where: { companyId },
      order: { updatedAt: 'DESC' },
      take: 200,
    });
    const output: Array<Awaited<ReturnType<ScorecardService['decorate']>>> = [];
    for (const row of rows) {
      try {
        await this.visible(actor, row);
        output.push(
          await this.decorate(
            actor,
            row,
            actor.roles.includes('EMPLOYEE') &&
              !actor.roles.some((r) => readers.includes(r)),
          ),
        );
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error;
      }
    }
    return output;
  }
  async get(actor: AuthenticatedUser, id: number) {
    const row = await this.scorecards.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!row) throw new NotFoundException('Scorecard not found');
    await this.visible(actor, row);
    return this.decorate(
      actor,
      row,
      actor.roles.includes('EMPLOYEE') &&
        !actor.roles.some((r) => readers.includes(r)),
    );
  }
  async mine(actor: AuthenticatedUser) {
    this.role(actor, ['EMPLOYEE', ...readers]);
    if (!actor.employeeId)
      throw new ForbiddenException('Employee identity required');
    const rows = await this.scorecards.find({
      where: {
        companyId: this.company(actor),
        subjectType: 'employee',
        subjectId: actor.employeeId,
      },
      order: { updatedAt: 'DESC' },
    });
    const output: Array<Awaited<ReturnType<ScorecardService['decorate']>>> = [];
    for (const row of rows) {
      if (row.status === 'archived') continue;
      const versions = await this.versions.find({
        where: { scorecardId: row.id },
        order: { version: 'DESC' },
      });
      if (versions.some((v) => v.publishedAt))
        output.push(await this.decorate(actor, row, true));
    }
    return output;
  }
  async create(actor: AuthenticatedUser, dto: ScorecardCreateDto) {
    this.role(actor, managers);
    const companyId = this.company(actor);
    const code = this.code(dto.code);
    if (await this.scorecards.existsBy({ companyId, code }))
      throw new ConflictException('Scorecard identifier already exists');
    const snapshot = await this.subject(actor, dto.subjectType, dto.subjectId);
    await this.period(companyId, dto.periodId);
    if (dto.managerEmployeeId)
      await this.kpi.scorecardSubject(actor, 'employee', dto.managerEmployeeId);
    await this.publishedPolicy(actor, dto.policyVersionId);
    const entries = await this.entries(
      actor,
      dto.subjectType,
      dto.subjectId,
      dto.periodId,
      dto.entries,
    );
    const total = entries.reduce((sum, e) => sum + Number(e.weight), 0);
    if (
      entries.some(
        (e) => !Number.isFinite(Number(e.weight)) || Number(e.weight) < 0,
      )
    )
      throw new BadRequestException('Invalid KPI weight');
    if (dto.mode === 'strategic' && total !== 0)
      throw new BadRequestException('Strategic scorecards cannot have weights');
    try {
      const card = await this.db.transaction(async (manager) => {
        const card = await manager.save(
          Scorecard,
          manager.create(Scorecard, {
            companyId,
            code,
            subjectType: dto.subjectType,
            subjectId: dto.subjectId,
            periodId: dto.periodId,
            managerEmployeeId: dto.managerEmployeeId ?? null,
            organizationSnapshot: snapshot,
            status: 'draft',
            createdBy: actor.id,
          }),
        );
        await manager.save(
          ScorecardVersion,
          manager.create(ScorecardVersion, {
            companyId,
            scorecardId: card.id,
            version: 1,
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            mode: dto.mode,
            policyVersionId: dto.policyVersionId ?? null,
            entries,
            publishedAt: null,
            createdBy: actor.id,
          }),
        );
        return card;
      });
      return this.get(actor, card.id);
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('Scorecard identifier already exists');
      throw error;
    }
  }
  async updateDraft(
    actor: AuthenticatedUser,
    id: number,
    dto: ScorecardDraftDto,
  ) {
    const card = await this.scorecards.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!card) throw new NotFoundException('Scorecard not found');
    await this.visible(actor, card, true);
    if (card.status === 'archived')
      throw new ConflictException('Archived scorecard cannot be edited');
    const version = await this.latestVersion(card.id);
    if (version.publishedAt)
      throw new ConflictException(
        'Published scorecard version is immutable; create a draft revision',
      );
    await this.publishedPolicy(actor, dto.policyVersionId);
    version.name = dto.name.trim();
    version.description = dto.description?.trim() || null;
    version.mode = dto.mode;
    version.policyVersionId = dto.policyVersionId ?? null;
    version.entries = await this.entries(
      actor,
      card.subjectType,
      card.subjectId,
      card.periodId,
      dto.entries,
    );
    await this.versions.save(version);
    return this.get(actor, id);
  }
  async revise(actor: AuthenticatedUser, id: number) {
    const card = await this.scorecards.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!card) throw new NotFoundException('Scorecard not found');
    await this.visible(actor, card, true);
    const current = await this.latestVersion(id);
    if (!current.publishedAt || card.status === 'archived')
      throw new ConflictException('Only a published scorecard can be revised');
    await this.db.transaction(async (manager) => {
      await manager.save(
        ScorecardVersion,
        manager.create(ScorecardVersion, {
          companyId: card.companyId,
          scorecardId: id,
          version: current.version + 1,
          name: current.name,
          description: current.description,
          mode: current.mode,
          policyVersionId: current.policyVersionId,
          entries: current.entries,
          publishedAt: null,
          createdBy: actor.id,
        }),
      );
      card.status = 'draft';
      await manager.save(card);
    });
    return this.get(actor, id);
  }
  async publish(actor: AuthenticatedUser, id: number) {
    const card = await this.scorecards.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!card) throw new NotFoundException('Scorecard not found');
    await this.visible(actor, card, true);
    const version = await this.latestVersion(id);
    if (version.publishedAt || card.status === 'archived')
      throw new ConflictException('Only a draft scorecard can be published');
    validateWeights(
      version.entries.map((e) => e.weight),
      version.mode,
    );
    if (version.mode === 'weighted')
      await this.publishedPolicy(actor, version.policyVersionId ?? undefined);
    if (version.mode === 'weighted' && !version.policyVersionId)
      throw new BadRequestException(
        'Weighted scorecard requires a published scoring policy',
      );
    version.entries = await this.entries(
      actor,
      card.subjectType,
      card.subjectId,
      card.periodId,
      version.entries,
    );
    await this.db.transaction(async (manager) => {
      version.publishedAt = new Date();
      await manager.save(version);
      card.status = 'published';
      await manager.save(card);
    });
    return this.get(actor, id);
  }
  async activate(actor: AuthenticatedUser, id: number) {
    const card = await this.scorecards.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!card) throw new NotFoundException('Scorecard not found');
    await this.visible(actor, card, true);
    if (card.status !== 'published')
      throw new ConflictException(
        'Only a published scorecard can become active',
      );
    card.status = 'active';
    await this.scorecards.save(card);
    return this.get(actor, id);
  }
  async clone(actor: AuthenticatedUser, id: number, dto: CloneDto) {
    const source = await this.get(actor, id);
    this.role(actor, managers);
    const version = source.currentVersion;
    return this.create(actor, {
      code: dto.code,
      name: dto.name?.trim() || version.name,
      description: version.description ?? undefined,
      subjectType: source.subjectType,
      subjectId: source.subjectId,
      periodId: source.periodId,
      managerEmployeeId: source.managerEmployeeId ?? undefined,
      mode: version.mode,
      policyVersionId: version.policyVersionId ?? undefined,
      entries: version.entries.map((e) => ({
        assignmentId: e.assignmentId,
        weight: e.weight,
        required: e.required,
      })),
    });
  }
  async archive(actor: AuthenticatedUser, id: number) {
    const card = await this.scorecards.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!card) throw new NotFoundException('Scorecard not found');
    await this.visible(actor, card, true);
    card.status = 'archived';
    await this.scorecards.save(card);
    return this.get(actor, id);
  }

  async listPolicies(actor: AuthenticatedUser) {
    this.role(actor, readers);
    if (
      !this.access.hasCompanyScope(actor) &&
      !actor.roles.some((r) => managers.includes(r))
    )
      throw new ForbiddenException('Scoring policy scope required');
    const rows = await this.policies.find({
      where: { companyId: this.company(actor) },
      order: { id: 'DESC' },
      take: 100,
    });
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        versions: await this.policyVersions.find({
          where: { policyId: row.id },
          order: { version: 'DESC' },
        }),
      })),
    );
  }
  async getPolicy(actor: AuthenticatedUser, id: number) {
    this.role(actor, readers);
    const row = await this.policies.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!row) throw new NotFoundException('Scoring policy not found');
    return {
      ...row,
      versions: await this.policyVersions.find({
        where: { policyId: id },
        order: { version: 'DESC' },
      }),
    };
  }
  async createPolicy(actor: AuthenticatedUser, dto: PolicyDto) {
    this.administrator(actor);
    const companyId = this.company(actor),
      code = this.code(dto.code);
    validateScoringConfig(dto.config, dto.ratingBands);
    if (await this.policies.existsBy({ companyId, code }))
      throw new ConflictException('Scoring policy identifier exists');
    const policy = await this.db.transaction(async (manager) => {
      const row = await manager.save(
        ScoringPolicy,
        manager.create(ScoringPolicy, { companyId, code, createdBy: actor.id }),
      );
      await manager.save(
        ScoringPolicyVersion,
        manager.create(ScoringPolicyVersion, {
          companyId,
          policyId: row.id,
          version: 1,
          name: dto.name.trim(),
          method: dto.method,
          config: dto.config as unknown as Record<string, unknown>,
          ratingBands: dto.ratingBands,
          publishedAt: null,
          createdBy: actor.id,
        }),
      );
      return row;
    });
    return this.getPolicy(actor, policy.id);
  }
  async updatePolicyDraft(
    actor: AuthenticatedUser,
    id: number,
    dto: PolicyDraftDto,
  ) {
    this.administrator(actor);
    const row = await this.getPolicy(actor, id),
      version = row.versions[0];
    if (version.publishedAt)
      throw new ConflictException(
        'Published scoring policy is immutable; create a revision',
      );
    validateScoringConfig(dto.config, dto.ratingBands);
    version.name = dto.name.trim();
    version.method = dto.method;
    version.config = dto.config as unknown as Record<string, unknown>;
    version.ratingBands = dto.ratingBands;
    await this.policyVersions.save(version);
    return this.getPolicy(actor, id);
  }
  async revisePolicy(actor: AuthenticatedUser, id: number) {
    this.administrator(actor);
    const row = await this.getPolicy(actor, id),
      current = row.versions[0];
    if (!current.publishedAt)
      throw new ConflictException('Draft scoring policy already exists');
    await this.policyVersions.save(
      this.policyVersions.create({
        companyId: row.companyId,
        policyId: id,
        version: current.version + 1,
        name: current.name,
        method: current.method,
        config: current.config,
        ratingBands: current.ratingBands,
        publishedAt: null,
        createdBy: actor.id,
      }),
    );
    return this.getPolicy(actor, id);
  }
  async publishPolicy(actor: AuthenticatedUser, id: number) {
    this.administrator(actor);
    const row = await this.getPolicy(actor, id),
      version = row.versions[0];
    if (version.publishedAt)
      throw new ConflictException('Scoring policy version already published');
    validateScoringConfig(
      version.config as unknown as ScoringConfig,
      version.ratingBands,
    );
    version.publishedAt = new Date();
    await this.policyVersions.save(version);
    return this.getPolicy(actor, id);
  }
  async preview(actor: AuthenticatedUser, id: number, dto: PreviewDto) {
    this.role(actor, managers);
    const card = await this.get(actor, id);
    const version = card.currentVersion;
    if (version.mode === 'weighted')
      validateWeights(
        version.entries.map((e) => e.weight),
        version.mode,
      );
    const policy = version.policyVersionId
      ? await this.publishedPolicy(actor, version.policyVersionId)
      : null;
    const config = policy
      ? (policy.config as unknown as ScoringConfig)
      : DEFAULT_SCORING_CONFIG;
    const bands = policy?.ratingBands ?? DEFAULT_RATING_BANDS;
    if (
      dto.examples.some(
        (e) =>
          !version.entries.some(
            (entry) => entry.assignmentId === e.assignmentId,
          ),
      )
    )
      throw new BadRequestException(
        'Example input does not belong to this scorecard',
      );
    const inputs = await Promise.all(
      version.entries.map(async (entry) => {
        const definition = await this.definitions.findOneBy({
          id: entry.definitionVersionId,
          companyId: card.companyId,
        });
        const target = await this.targets.findOneBy({
          id: entry.targetRevisionId,
          companyId: card.companyId,
        });
        if (!definition || !target)
          throw new BadRequestException(
            'Historical KPI definition or target unavailable',
          );
        const example = dto.examples.find(
          (e) => e.assignmentId === entry.assignmentId,
        );
        return {
          entryId: entry.assignmentId,
          weight: entry.weight,
          required: entry.required,
          type: definition.measurementType,
          direction: definition.direction,
          target: target.target,
          actual: example?.actual,
          notApplicable: example?.notApplicable,
        };
      }),
    );
    return {
      ...previewScorecard(inputs, version.mode, config, bands),
      exampleOnly: true,
      persisted: false,
      scorecardVersionId: version.id,
      policyVersionId: policy?.id ?? null,
    };
  }

  async listTemplates(actor: AuthenticatedUser) {
    this.role(actor, readers);
    return this.templates.find({
      where: { companyId: this.company(actor) },
      order: { id: 'DESC' },
      take: 100,
    });
  }
  async createTemplate(actor: AuthenticatedUser, dto: ScorecardTemplateDto) {
    this.administrator(actor);
    const companyId = this.company(actor),
      code = this.code(dto.code);
    if (await this.templates.existsBy({ companyId, code }))
      throw new ConflictException('Scorecard template identifier exists');
    if (
      !Array.isArray(dto.items) ||
      new Set(dto.items.map((i) => i.definitionId)).size !== dto.items.length
    )
      throw new BadRequestException(
        'Duplicate or invalid template KPI definitions',
      );
    for (const item of dto.items) {
      if (
        !Number.isInteger(item.definitionId) ||
        item.definitionId < 1 ||
        !(await this.definitions.existsBy({
          definitionId: item.definitionId,
          companyId,
          publishedAt: Not(IsNull()),
        }))
      )
        throw new BadRequestException(
          'Template KPI definition outside company',
        );
    }
    await this.publishedPolicy(actor, dto.policyVersionId);
    return this.templates.save(
      this.templates.create({
        companyId,
        code,
        name: dto.name.trim(),
        mode: dto.mode,
        policyVersionId: dto.policyVersionId ?? null,
        items: dto.items,
        status: 'draft',
        createdBy: actor.id,
      }),
    );
  }
  async updateTemplate(
    actor: AuthenticatedUser,
    id: number,
    dto: ScorecardTemplateDto,
  ) {
    this.administrator(actor);
    const row = await this.templates.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!row) throw new NotFoundException('Scorecard template not found');
    if (row.status === 'published')
      throw new ConflictException('Published scorecard template is immutable');
    const code = this.code(dto.code);
    if (
      code !== row.code &&
      (await this.templates.existsBy({ companyId: row.companyId, code }))
    )
      throw new ConflictException('Template identifier exists');
    if (
      !Array.isArray(dto.items) ||
      new Set(dto.items.map((i) => i.definitionId)).size !== dto.items.length
    )
      throw new BadRequestException('Duplicate template KPI definitions');
    for (const item of dto.items)
      if (
        !(await this.definitions.existsBy({
          definitionId: item.definitionId,
          companyId: row.companyId,
          publishedAt: Not(IsNull()),
        }))
      )
        throw new BadRequestException(
          'Template KPI definition outside company',
        );
    await this.publishedPolicy(actor, dto.policyVersionId);
    row.code = code;
    row.name = dto.name.trim();
    row.mode = dto.mode;
    row.policyVersionId = dto.policyVersionId ?? null;
    row.items = dto.items;
    return this.templates.save(row);
  }
  async publishTemplate(actor: AuthenticatedUser, id: number) {
    this.administrator(actor);
    const row = await this.templates.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!row) throw new NotFoundException('Scorecard template not found');
    if (row.status === 'published')
      throw new ConflictException('Scorecard template already published');
    validateWeights(
      row.items.map((i) => i.weight),
      row.mode,
    );
    if (row.mode === 'weighted' && !row.policyVersionId)
      throw new BadRequestException(
        'Weighted template requires a scoring policy',
      );
    row.status = 'published';
    return this.templates.save(row);
  }
  async useTemplate(
    actor: AuthenticatedUser,
    id: number,
    dto: UseScorecardTemplateDto,
  ) {
    this.role(actor, managers);
    const companyId = this.company(actor);
    const template = await this.templates.findOneBy({
      id,
      companyId,
      status: 'published',
    });
    if (!template)
      throw new NotFoundException('Published scorecard template not found');
    await this.subject(actor, dto.subjectType, dto.subjectId);
    await this.period(companyId, dto.periodId);
    const entries: ScorecardDraftDto['entries'] = [];
    for (const item of template.items) {
      const possible = await this.assignments
        .createQueryBuilder('a')
        .innerJoin(KpiDefinitionVersion, 'v', 'v.id = a.definitionVersionId')
        .where(
          'a.companyId = :companyId AND a.periodId = :periodId AND a.status = :status AND v.definition_id = :definitionId',
          {
            companyId,
            periodId: dto.periodId,
            status: 'active',
            definitionId: item.definitionId,
          },
        )
        .andWhere(
          dto.subjectType === 'organization'
            ? '1=1'
            : 'a.subjectType = :subjectType AND a.subjectId = :subjectId',
          dto.subjectType === 'organization'
            ? {}
            : { subjectType: dto.subjectType, subjectId: dto.subjectId },
        )
        .getMany();
      if (possible.length !== 1)
        throw new BadRequestException(
          `Template KPI definition ${item.definitionId} needs exactly one matching assignment in this period and scope`,
        );
      await this.kpi.getAssignment(actor, possible[0].id);
      entries.push({
        assignmentId: possible[0].id,
        weight: item.weight,
        required: true,
      });
    }
    return this.create(actor, {
      code: dto.code,
      name: dto.name?.trim() || template.name,
      subjectType: dto.subjectType,
      subjectId: dto.subjectId,
      periodId: dto.periodId,
      managerEmployeeId: dto.managerEmployeeId,
      mode: template.mode,
      policyVersionId: template.policyVersionId ?? undefined,
      entries,
    });
  }
}
