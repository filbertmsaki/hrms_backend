import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Company } from '../../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { KpiAchievement, KpiAchievementRevision } from './achievement.entities';
import { KpiAnalyticsQueryDto } from './dto/kpi-analytics.dto';
import { EvaluationCycle, PerformanceEvaluation } from './evaluation.entities';
import {
  KpiAssignment,
  KpiDefinition,
  KpiDefinitionVersion,
  KpiPeriod,
  KpiTargetRevision,
} from './kpi.entities';
import { Scorecard, type ScorecardEntryConfig } from './scorecard.entities';
import { ScorecardService } from './scorecard.service';

type Audience = 'admin' | 'manager' | 'executive' | 'employee';

@Injectable()
export class KpiAnalyticsService {
  constructor(
    @InjectRepository(KpiAssignment)
    private readonly assignments: Repository<KpiAssignment>,
    @InjectRepository(KpiPeriod)
    private readonly periods: Repository<KpiPeriod>,
    @InjectRepository(Scorecard)
    private readonly scorecardRows: Repository<Scorecard>,
    @InjectRepository(PerformanceEvaluation)
    private readonly evaluationRows: Repository<PerformanceEvaluation>,
    @InjectRepository(EvaluationCycle)
    private readonly cycles: Repository<EvaluationCycle>,
    @InjectRepository(KpiTargetRevision)
    private readonly targets: Repository<KpiTargetRevision>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(Department)
    private readonly departments: Repository<Department>,
    @InjectRepository(Branch)
    private readonly branches: Repository<Branch>,
    private readonly access: HrAccessService,
    private readonly scorecardService: ScorecardService,
  ) {}

  private signature(entries: ScorecardEntryConfig[]) {
    return entries
      .map(
        (entry) =>
          `${entry.definitionVersionId}:${Number(entry.weight).toFixed(4)}:${entry.required ? 1 : 0}`,
      )
      .sort()
      .join('|');
  }

  private async scorecardDetails(actor: AuthenticatedUser, rows: Scorecard[]) {
    return this.scorecardService.analyticsDetails(actor, rows);
  }

  private audience(actor: AuthenticatedUser): Audience {
    if (
      actor.roles.some((role) => ['COMPANY_ADMIN', 'HR_MANAGER'].includes(role))
    ) {
      if (!this.access.hasCompanyScope(actor))
        throw new ForbiddenException('Company analytics scope required');
      return 'admin';
    }
    if (
      actor.roles.some((role) =>
        ['DEPARTMENT_MANAGER', 'BRANCH_MANAGER'].includes(role),
      )
    )
      return 'manager';
    if (actor.roles.includes('MANAGEMENT')) {
      if (!this.access.hasCompanyScope(actor))
        throw new ForbiddenException('Company analytics scope required');
      return 'executive';
    }
    if (actor.roles.includes('EMPLOYEE')) return 'employee';
    throw new ForbiddenException('KPI analytics access denied');
  }

  private async scope(actor: AuthenticatedUser, query: KpiAnalyticsQueryDto) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const audience = this.audience(actor);
    if (query.performanceStatus)
      throw new BadRequestException('Risk status not configured');
    if (query.companyId && query.companyId !== companyId)
      throw new ForbiddenException('Company outside active membership');
    if (
      query.periodId &&
      !(await this.periods.existsBy({ id: query.periodId, companyId }))
    )
      throw new BadRequestException(
        'Reporting period is outside the active company',
      );
    if (
      query.cycleId &&
      !(await this.cycles.existsBy({ id: query.cycleId, companyId }))
    )
      throw new BadRequestException(
        'Evaluation cycle is outside the active company',
      );
    if (
      query.departmentId &&
      !(await this.departments.existsBy({
        id: query.departmentId,
        company_id: companyId,
      }))
    )
      throw new BadRequestException('Department is outside the active company');
    if (
      query.branchId &&
      !(await this.branches.existsBy({
        id: query.branchId,
        company_id: companyId,
      }))
    )
      throw new BadRequestException('Branch is outside the active company');
    let employeeIds: number[] | null = null;
    if (audience === 'employee') {
      if (!actor.employeeId)
        throw new ForbiddenException('Employee identity required');
      employeeIds = [actor.employeeId];
    } else if (audience === 'manager') {
      const reporting = await this.access.getReportingEmployeeIds(actor);
      const permitted = await this.access.getAccessibleEmployeeIds(actor);
      employeeIds =
        permitted === null
          ? reporting
          : reporting.filter((id) => permitted.includes(id));
    }
    if (query.employeeId) {
      if (audience === 'executive')
        throw new ForbiddenException(
          'Individual employee analytics unavailable',
        );
      if (employeeIds && !employeeIds.includes(query.employeeId))
        throw new ForbiddenException('Employee outside reporting scope');
      employeeIds = [query.employeeId];
    }
    if (query.managerId) {
      if (audience === 'employee' || audience === 'executive')
        throw new ForbiddenException('Manager filter is not authorized');
      if (audience === 'manager' && query.managerId !== actor.employeeId)
        throw new ForbiddenException('Manager outside reporting scope');
      if (
        !(await this.employees.existsBy({
          id: query.managerId,
          company_id: companyId,
        }))
      )
        throw new BadRequestException('Manager is outside the active company');
    }
    if (
      query.definitionId &&
      !(await this.assignments.manager
        .getRepository(KpiDefinitionVersion)
        .createQueryBuilder('v')
        .where('v.companyId = :companyId', { companyId })
        .andWhere('v.definitionId = :definitionId', {
          definitionId: query.definitionId,
        })
        .getExists())
    )
      throw new BadRequestException(
        'KPI definition is outside the active company',
      );
    return { companyId, audience, employeeIds };
  }

  private applyAssignmentScope(
    qb: ReturnType<Repository<KpiAssignment>['createQueryBuilder']>,
    scope: Awaited<ReturnType<KpiAnalyticsService['scope']>>,
    query: KpiAnalyticsQueryDto,
  ) {
    qb.where('a.company_id = :companyId', { companyId: scope.companyId });
    if (query.periodId)
      qb.andWhere('a.period_id = :periodId', { periodId: query.periodId });
    if (query.managerId)
      qb.andWhere('a.manager_employee_id = :managerId', {
        managerId: query.managerId,
      });
    if (query.definitionId)
      qb.andWhere('v.definition_id = :definitionId', {
        definitionId: query.definitionId,
      });
    if (query.category)
      qb.andWhere('v.category = :category', { category: query.category });
    if (query.approvalStatus === 'approved')
      qb.andWhere('approved.id IS NOT NULL');
    if (query.approvalStatus === 'pending')
      qb.andWhere(
        "approved.id IS NULL AND latest.status IN ('submitted','under_review')",
      );
    if (query.approvalStatus === 'missing')
      qb.andWhere('approved.id IS NULL AND latest.id IS NULL');
    if (['draft', 'returned', 'rejected'].includes(query.approvalStatus ?? ''))
      qb.andWhere('approved.id IS NULL AND latest.status = :approvalStatus', {
        approvalStatus: query.approvalStatus,
      });
    if (scope.employeeIds) {
      qb.andWhere('a.subject_type = :subjectType', { subjectType: 'employee' });
      qb.andWhere('a.subject_id IN (:...employeeIds)', {
        employeeIds: scope.employeeIds.length ? scope.employeeIds : [-1],
      });
    }
    if (scope.audience === 'executive')
      qb.andWhere("a.subject_type IN ('department','branch')");
    if (query.departmentId || query.branchId) {
      if (query.departmentId)
        qb.andWhere(
          "(a.organization_snapshot->>'departmentId')::int = :departmentId",
          {
            departmentId: query.departmentId,
          },
        );
      if (query.branchId)
        qb.andWhere("(a.organization_snapshot->>'branchId')::int = :branchId", {
          branchId: query.branchId,
        });
    }
    return qb;
  }

  async subjects(actor: AuthenticatedUser, query: KpiAnalyticsQueryDto) {
    const scope = await this.scope(actor, query);
    if (!['admin', 'manager'].includes(scope.audience))
      throw new ForbiddenException('Individual subject search is restricted');
    const search = query.search?.trim() ?? '';
    const searchValue = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const employeeQuery = this.employees
      .createQueryBuilder('employee')
      .where('employee.company_id = :companyId', {
        companyId: scope.companyId,
      });
    if (scope.employeeIds)
      employeeQuery.andWhere('employee.id IN (:...ids)', {
        ids: scope.employeeIds.length ? scope.employeeIds : [-1],
      });
    if (search)
      employeeQuery.andWhere(
        "(employee.first_name ILIKE :search ESCAPE '\\' OR employee.last_name ILIKE :search ESCAPE '\\')",
        { search: searchValue },
      );
    const employees = await employeeQuery
      .orderBy('employee.id', 'ASC')
      .limit(30)
      .getMany();
    const managers =
      scope.audience === 'manager'
        ? actor.employeeId
          ? await this.employees.findBy({
              id: actor.employeeId,
              company_id: scope.companyId,
            })
          : []
        : await this.employees
            .createQueryBuilder('employee')
            .where('employee.company_id = :companyId', {
              companyId: scope.companyId,
            })
            .andWhere(
              '(EXISTS (SELECT 1 FROM phase1a_kpi_assignments a WHERE a.company_id = employee.company_id AND a.manager_employee_id = employee.id) OR EXISTS (SELECT 1 FROM phase4_evaluations e WHERE e.company_id = employee.company_id AND e.manager_employee_id = employee.id))',
            )
            .andWhere(
              search
                ? "(employee.first_name ILIKE :search ESCAPE '\\' OR employee.last_name ILIKE :search ESCAPE '\\')"
                : '1=1',
              { search: searchValue },
            )
            .orderBy('employee.id', 'ASC')
            .limit(30)
            .getMany();
    const concise = (row: Employee) => ({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`,
    });
    return {
      employees: employees.map(concise),
      managers: managers.map(concise),
      limit: 30,
      refreshedAt: new Date().toISOString(),
    };
  }

  /** Includes definitions pinned by historical assignments, even after archiving. */
  async historicalDefinitions(
    actor: AuthenticatedUser,
    query: KpiAnalyticsQueryDto,
  ) {
    const scope = await this.scope(actor, query);
    if (scope.audience === 'executive')
      throw new ForbiddenException('KPI definition catalogue is restricted');
    const qb = this.assignments
      .createQueryBuilder('a')
      .innerJoin(
        KpiDefinitionVersion,
        'v',
        'v.id = a.definition_version_id AND v.company_id = a.company_id',
      )
      .innerJoin(
        KpiDefinition,
        'd',
        'd.id = v.definition_id AND d.company_id = a.company_id',
      );
    this.applyAssignmentScope(qb, scope, query);
    const rows = await qb
      .select('d.id', 'id')
      .addSelect('d.code', 'code')
      .addSelect('d.status', 'status')
      .addSelect('v.name', 'name')
      .addSelect('v.category', 'category')
      .addSelect('v.version', 'version')
      .distinctOn(['d.id'])
      .orderBy('d.id', 'ASC')
      .addOrderBy('v.version', 'DESC')
      .limit(500)
      .getRawMany<{
        id: string;
        code: string;
        status: string;
        name: string;
        category: string;
        version: string;
      }>();
    return {
      rows: rows.map((row) => ({
        ...row,
        id: Number(row.id),
        version: Number(row.version),
      })),
      limit: 500,
      refreshedAt: new Date().toISOString(),
    };
  }

  /** Organization-wide data coverage; this is not a composite performance score. */
  async coverage(actor: AuthenticatedUser, query: KpiAnalyticsQueryDto) {
    const scope = await this.scope(actor, query);
    if (scope.audience === 'executive')
      return {
        suppressed: true,
        reason:
          'Small-group scorecard coverage withheld until a disclosure policy is approved',
        refreshedAt: new Date().toISOString(),
      };
    const params: unknown[] = [scope.companyId];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const employeeWhere = [
      'e.company_id = $1',
      "e.employment_status IN ('active','onboarding')",
    ];
    const scorecardWhere = [
      's.company_id = $1',
      "s.status IN ('published','active')",
    ];
    if (scope.employeeIds) {
      const ids = bind(scope.employeeIds.length ? scope.employeeIds : [-1]);
      employeeWhere.push(`e.id = ANY(${ids}::int[])`);
      scorecardWhere.push(
        `s.subject_type = 'employee' AND s.subject_id = ANY(${ids}::int[])`,
      );
    }
    if (query.employeeId) {
      employeeWhere.push(`e.id = ${bind(query.employeeId)}`);
      scorecardWhere.push(
        `s.subject_type = 'employee' AND s.subject_id = ${bind(query.employeeId)}`,
      );
    }
    if (query.departmentId) {
      employeeWhere.push(
        `e.primary_department_id = ${bind(query.departmentId)}`,
      );
      scorecardWhere.push(
        `(s.organization_snapshot->>'departmentId')::int = ${bind(query.departmentId)}`,
      );
    }
    if (query.branchId) {
      employeeWhere.push(`e.primary_branch_id = ${bind(query.branchId)}`);
      scorecardWhere.push(
        `(s.organization_snapshot->>'branchId')::int = ${bind(query.branchId)}`,
      );
    }
    if (query.periodId)
      scorecardWhere.push(`s.period_id = ${bind(query.periodId)}`);
    if (query.scorecardType)
      scorecardWhere.push(`s.subject_type = ${bind(query.scorecardType)}`);
    if (query.managerId) {
      employeeWhere.push(`e.reports_to = ${bind(query.managerId)}`);
      scorecardWhere.push(`s.manager_employee_id = ${bind(query.managerId)}`);
    }
    if (query.cycleId || query.evaluationStatus) {
      const clauses = [
        'ev.company_id = s.company_id',
        'ev.scorecard_id = s.id',
      ];
      if (query.cycleId) clauses.push(`ev.cycle_id = ${bind(query.cycleId)}`);
      if (query.evaluationStatus)
        clauses.push(`ev.status = ${bind(query.evaluationStatus)}`);
      scorecardWhere.push(
        `EXISTS (SELECT 1 FROM phase4_evaluations ev WHERE ${clauses.join(' AND ')})`,
      );
    }
    const rawCoverage: unknown = await this.scorecardRows.query(
      `
      WITH eligible_employees AS (
        SELECT e.id FROM employees e WHERE ${employeeWhere.join(' AND ')}
      ), selected_scorecards AS (
        SELECT s.id, s.subject_type, s.subject_id, v.entries
        FROM phase2_scorecards s
        JOIN LATERAL (
          SELECT version.entries FROM phase2_scorecard_versions version
          WHERE version.company_id = s.company_id AND version.scorecard_id = s.id
            AND version.published_at IS NOT NULL
          ORDER BY version.version DESC LIMIT 1
        ) v ON true
        WHERE ${scorecardWhere.join(' AND ')}
      ), entry_counts AS (
        SELECT s.id,
          COUNT(entry.value) FILTER (WHERE COALESCE((entry.value->>'required')::boolean, true)) AS required_count,
          COUNT(approved.id) FILTER (WHERE COALESCE((entry.value->>'required')::boolean, true)) AS approved_count,
          COUNT(approved.id) AS any_approved_count
        FROM selected_scorecards s
        LEFT JOIN LATERAL jsonb_array_elements(s.entries) entry(value) ON true
        LEFT JOIN phase3_kpi_achievements achievement
          ON achievement.company_id = $1 AND achievement.assignment_id = (entry.value->>'assignmentId')::int
        LEFT JOIN phase3_kpi_achievement_revisions approved
          ON approved.id = achievement.approved_revision_id AND approved.company_id = $1 AND approved.status = 'approved'
        GROUP BY s.id
      )
      SELECT (SELECT COUNT(*) FROM eligible_employees)::int AS eligible_employees,
        (SELECT COUNT(DISTINCT s.subject_id) FROM selected_scorecards s JOIN eligible_employees e ON e.id = s.subject_id WHERE s.subject_type = 'employee')::int AS employees_with_scorecards,
        (SELECT COUNT(*) FROM selected_scorecards)::int AS scorecards,
        (SELECT COUNT(*) FROM entry_counts WHERE required_count > 0 AND approved_count = required_count)::int AS complete_scorecards,
        (SELECT COUNT(*) FROM entry_counts WHERE required_count = 0 OR approved_count < required_count)::int AS incomplete_scorecards,
        (SELECT COUNT(*) FROM entry_counts WHERE any_approved_count = 0)::int AS awaiting_approved_achievements
    `,
      params,
    );
    const [row] = rawCoverage as Array<Record<string, number>>;
    const eligibleEmployees = Number(row?.eligible_employees ?? 0);
    const employeesWithScorecards = Number(row?.employees_with_scorecards ?? 0);
    const evaluations = await this.evaluations(actor, query);
    return {
      suppressed: false,
      eligibleEmployees,
      employeesWithScorecards,
      employeesWithoutScorecards: Math.max(
        0,
        eligibleEmployees - employeesWithScorecards,
      ),
      scorecards: Number(row?.scorecards ?? 0),
      completeScorecards: Number(row?.complete_scorecards ?? 0),
      incompleteScorecards: Number(row?.incomplete_scorecards ?? 0),
      awaitingApprovedAchievements: Number(
        row?.awaiting_approved_achievements ?? 0,
      ),
      finalizedEvaluations: evaluations.summary.finalized,
      evaluationsInProgress:
        evaluations.summary.total === null ||
        evaluations.summary.finalized === null
          ? null
          : evaluations.summary.total - evaluations.summary.finalized,
      note: 'Employees are active or onboarding employee records in scope. Scorecards are published configurations; complete means every required entry has an approved actual. Awaiting approval is a subset of incomplete, not an additional scorecard total. KPI definition/category filters affect assignment results, not this coverage summary.',
      refreshedAt: new Date().toISOString(),
    };
  }

  async overview(actor: AuthenticatedUser, query: KpiAnalyticsQueryDto) {
    const scope = await this.scope(actor, query);
    const qb = this.assignments
      .createQueryBuilder('a')
      .innerJoin(
        KpiDefinitionVersion,
        'v',
        'v.id = a.definition_version_id AND v.company_id = a.company_id',
      )
      .leftJoin(
        KpiAchievement,
        'root',
        'root.assignment_id = a.id AND root.company_id = a.company_id',
      )
      .leftJoin(
        KpiAchievementRevision,
        'approved',
        "approved.id = root.approved_revision_id AND approved.company_id = a.company_id AND approved.status = 'approved'",
      )
      .leftJoin(
        KpiAchievementRevision,
        'latest',
        'latest.id = root.latest_revision_id AND latest.company_id = a.company_id',
      );
    this.applyAssignmentScope(qb, scope, query);
    qb.andWhere('a.status = :activeStatus', { activeStatus: 'active' });
    const raw = await qb
      .select('COUNT(*)', 'total')
      .addSelect('COUNT(*) FILTER (WHERE approved.id IS NOT NULL)', 'approved')
      .addSelect(
        "COUNT(*) FILTER (WHERE latest.status IN ('submitted','under_review'))",
        'pendingReview',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE approved.id IS NULL AND latest.status IN ('submitted','under_review'))",
        'pending',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE approved.id IS NULL AND latest.status = 'returned')",
        'returned',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE approved.id IS NULL AND latest.status = 'rejected')",
        'rejected',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE approved.id IS NULL AND latest.status = 'draft')",
        'draft',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE approved.id IS NULL AND (latest.status IS NULL OR latest.status NOT IN ('submitted','under_review','returned','rejected','draft')))",
        'missing',
      )
      .getRawOne<Record<string, string>>();
    const counts = {
      total: Number(raw?.total ?? 0),
      approved: Number(raw?.approved ?? 0),
      pendingReview: Number(raw?.pendingReview ?? 0),
      pending: Number(raw?.pending ?? 0),
      returned: Number(raw?.returned ?? 0),
      rejected: Number(raw?.rejected ?? 0),
      draft: Number(raw?.draft ?? 0),
      missing: Number(raw?.missing ?? 0),
    };
    const evaluations = await this.evaluations(actor, query);
    return {
      audience: scope.audience,
      periodId: query.periodId ?? null,
      refreshedAt: new Date().toISOString(),
      assignments: counts,
      completenessPercent: counts.total
        ? Number(((counts.approved * 100) / counts.total).toFixed(2))
        : null,
      overallIndex: null,
      overallIndexStatus: 'Overall index not configured',
      riskStatus: null,
      riskStatusStatus: 'Risk status not configured',
      evaluations: evaluations.summary,
      privacy:
        scope.audience === 'executive'
          ? 'Individual appraisal details are restricted'
          : null,
    };
  }

  async scorecards(actor: AuthenticatedUser, query: KpiAnalyticsQueryDto) {
    const scope = await this.scope(actor, query);
    const limit = Math.min(query.limit ?? 20, 20);
    const page = query.page ?? 1;
    const qb = this.scorecardRows
      .createQueryBuilder('s')
      .where('s.company_id = :companyId', { companyId: scope.companyId })
      .andWhere("s.status <> 'archived'");
    if (query.periodId)
      qb.andWhere('s.period_id = :periodId', { periodId: query.periodId });
    if (query.managerId)
      qb.andWhere('s.manager_employee_id = :managerId', {
        managerId: query.managerId,
      });
    if (query.scorecardType)
      qb.andWhere('s.subject_type = :scorecardType', {
        scorecardType: query.scorecardType,
      });
    if (query.cycleId || query.evaluationStatus)
      qb.andWhere(
        `EXISTS (SELECT 1 FROM phase4_evaluations evaluation
          WHERE evaluation.company_id = s.company_id AND evaluation.scorecard_id = s.id
          ${query.cycleId ? 'AND evaluation.cycle_id = :cycleId' : ''}
          ${query.evaluationStatus ? 'AND evaluation.status = :evaluationStatus' : ''})`,
        {
          cycleId: query.cycleId,
          evaluationStatus: query.evaluationStatus,
        },
      );
    if (query.definitionId || query.category || query.approvalStatus) {
      const statusPredicate =
        query.approvalStatus === 'approved'
          ? 'approved.id IS NOT NULL'
          : query.approvalStatus === 'pending'
            ? "approved.id IS NULL AND latest.status IN ('submitted','under_review')"
            : query.approvalStatus === 'missing'
              ? 'approved.id IS NULL AND latest.id IS NULL'
              : query.approvalStatus
                ? 'approved.id IS NULL AND latest.status = :approvalStatus'
                : '1=1';
      qb.andWhere(
        `EXISTS (SELECT 1 FROM phase2_scorecard_versions configuration
          CROSS JOIN LATERAL jsonb_array_elements(configuration.entries) entry
          JOIN phase1a_kpi_assignments assignment ON assignment.id = (entry->>'assignmentId')::int AND assignment.company_id = s.company_id
          JOIN phase1a_kpi_definition_versions definition ON definition.id = assignment.definition_version_id AND definition.company_id = s.company_id
          LEFT JOIN phase3_kpi_achievements root ON root.assignment_id = assignment.id AND root.company_id = s.company_id
          LEFT JOIN phase3_kpi_achievement_revisions approved ON approved.id = root.approved_revision_id AND approved.company_id = s.company_id AND approved.status = 'approved'
          LEFT JOIN phase3_kpi_achievement_revisions latest ON latest.id = root.latest_revision_id AND latest.company_id = s.company_id
          WHERE configuration.company_id = s.company_id AND configuration.scorecard_id = s.id
          AND configuration.version = (SELECT MAX(version) FROM phase2_scorecard_versions version WHERE version.company_id = s.company_id AND version.scorecard_id = s.id)
          ${query.definitionId ? 'AND definition.definition_id = :definitionId' : ''}
          ${query.category ? 'AND definition.category = :category' : ''}
          AND ${statusPredicate})`,
        {
          definitionId: query.definitionId,
          category: query.category,
          approvalStatus: query.approvalStatus,
        },
      );
    }
    if (scope.employeeIds)
      qb.andWhere('s.subject_type = :employee', {
        employee: 'employee',
      }).andWhere('s.subject_id IN (:...ids)', {
        ids: scope.employeeIds.length ? scope.employeeIds : [-1],
      });
    if (scope.audience === 'employee')
      qb.andWhere(
        'EXISTS (SELECT 1 FROM phase2_scorecard_versions published WHERE published.scorecard_id = s.id AND published.company_id = s.company_id AND published.published_at IS NOT NULL)',
      );
    if (scope.audience === 'executive')
      qb.andWhere("s.subject_type = 'organization'");
    if (query.departmentId)
      qb.andWhere(
        "(s.organization_snapshot->>'departmentId')::int = :departmentId",
        { departmentId: query.departmentId },
      );
    if (query.branchId)
      qb.andWhere("(s.organization_snapshot->>'branchId')::int = :branchId", {
        branchId: query.branchId,
      });
    const [rows, total] = await qb
      .orderBy('s.updated_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    if (scope.audience === 'executive') {
      const periods = rows.length
        ? await this.periods.findBy({
            companyId: scope.companyId,
            id: In(rows.map((row) => row.periodId)),
          })
        : [];
      return {
        rows: rows.map((row) => ({
          id: row.id,
          name: 'Organization scorecard',
          subjectType: row.subjectType,
          subjectId: row.subjectId,
          periodId: row.periodId,
          periodLabel:
            periods.find((period) => period.id === row.periodId)?.label ??
            'Unknown period',
          status: row.status,
          policyVersionId: null,
          scorecardVersionId: null,
          performanceStatus: 'withheld',
          completenessPercent: null,
          overallScore: null,
          rating: null,
          entries: [],
        })),
        total,
        page,
        limit,
        pageSummary: {
          complete: null,
          incomplete: null,
          withheld: rows.length,
        },
        privacy:
          'Scorecard detail withheld pending an approved disclosure policy',
        refreshedAt: new Date().toISOString(),
      };
    }
    const result: Array<Record<string, unknown>> = [];
    const details = await this.scorecardDetails(actor, rows);
    for (const [index, row] of rows.entries()) {
      const detail = details[index];
      result.push({
        id: row.id,
        name: detail.currentVersion.name,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        periodId: row.periodId,
        periodLabel: detail.period.label,
        status: row.status,
        policyVersionId: detail.currentVersion.policyVersionId,
        scorecardVersionId: detail.currentVersion.id,
        performanceStatus: detail.performanceStatus,
        completenessPercent: detail.completenessPercent,
        overallScore:
          detail.performanceStatus === 'scored' ? detail.overallScore : null,
        rating: detail.performanceStatus === 'scored' ? detail.rating : null,
        entries: detail.entries.map((entry) => ({
          assignmentId: entry.assignmentId,
          achievementId:
            (entry as typeof entry & { achievementId?: number })
              .achievementId ?? null,
          kpiName: entry.kpiName,
          definitionId: entry.definitionId,
          measurementType: entry.measurementType,
          measurementUnit: entry.measurementUnit,
          target: entry.target,
          actual: entry.actual,
          rawAchievement:
            (entry as typeof entry & { rawAchievement?: string })
              .rawAchievement ?? null,
          scoredAchievement: entry.achievement,
          weightedContribution: entry.weightedScore,
          weight: entry.weight,
          status: entry.status,
          targetStatus:
            entry.status === 'scored' &&
            ['higher', 'lower'].includes(entry.direction ?? '') &&
            Number.isFinite(
              Number(
                (entry as typeof entry & { rawAchievement?: string })
                  .rawAchievement,
              ),
            )
              ? Number(
                  (entry as typeof entry & { rawAchievement?: string })
                    .rawAchievement,
                ) > 100
                ? 'exceeded_target'
                : Number(
                      (entry as typeof entry & { rawAchievement?: string })
                        .rawAchievement,
                    ) >= 100
                  ? 'target_achieved'
                  : 'below_target'
              : null,
          required: entry.required,
        })),
      });
    }
    return {
      rows: result,
      total,
      page,
      limit,
      pageSummary: {
        complete: result.filter((row) => row.performanceStatus === 'scored')
          .length,
        incomplete: result.filter((row) => row.performanceStatus !== 'scored')
          .length,
        withheld: 0,
      },
      refreshedAt: new Date().toISOString(),
    };
  }

  async evaluations(actor: AuthenticatedUser, query: KpiAnalyticsQueryDto) {
    const scope = await this.scope(actor, query);
    const company = await this.companies.findOneBy({ id: scope.companyId });
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
      const part = (type: string) =>
        parts.find((item) => item.type === type)?.value ?? '';
      today = `${part('year')}-${part('month')}-${part('day')}`;
    } catch {
      today = new Date().toISOString().slice(0, 10);
    }
    const qb = this.evaluationRows
      .createQueryBuilder('e')
      .innerJoin(
        EvaluationCycle,
        'cycle',
        'cycle.id = e.cycle_id AND cycle.company_id = e.company_id',
      )
      .where('e.company_id = :companyId', { companyId: scope.companyId });
    if (scope.employeeIds)
      qb.andWhere('e.employee_id IN (:...ids)', {
        ids: scope.employeeIds.length ? scope.employeeIds : [-1],
      });
    if (query.cycleId)
      qb.andWhere('e.cycle_id = :cycleId', { cycleId: query.cycleId });
    if (query.periodId)
      qb.andWhere('cycle.period_id = :periodId', { periodId: query.periodId });
    if (query.managerId)
      qb.andWhere('e.manager_employee_id = :managerId', {
        managerId: query.managerId,
      });
    if (query.evaluationStatus)
      qb.andWhere('e.status = :evaluationStatus', {
        evaluationStatus: query.evaluationStatus,
      });
    if (query.departmentId)
      qb.andWhere(
        "(e.organization_snapshot->>'departmentId')::int = :departmentId",
        { departmentId: query.departmentId },
      );
    if (query.branchId)
      qb.andWhere("(e.organization_snapshot->>'branchId')::int = :branchId", {
        branchId: query.branchId,
      });
    const rows = await qb
      .select('e.status', 'status')
      .addSelect('e.ack_status', 'ackStatus')
      .addSelect('COUNT(*)', 'count')
      .addSelect(
        `COUNT(*) FILTER (WHERE
        (e.status IN ('self_draft','self_returned') AND cycle.self_deadline < :today) OR
        (e.status IN ('self_submitted','manager_draft') AND cycle.manager_deadline < :today) OR
        (e.status IN ('manager_submitted','hr_reviewed','approved') AND cycle.hr_deadline < :today) OR
        (e.status = 'finalized' AND e.ack_status IS NULL AND cycle.ack_deadline < :today))`,
        'overdue',
      )
      .setParameter('today', today)
      .groupBy('e.status')
      .addGroupBy('e.ack_status')
      .getRawMany<{
        status: string;
        ackStatus: string | null;
        count: string;
        overdue: string;
      }>();
    const byStatus: Record<string, number> = {};
    let total = 0,
      acknowledged = 0,
      disputed = 0,
      overdue = 0;
    for (const row of rows) {
      const count = Number(row.count);
      total += count;
      overdue += Number(row.overdue);
      byStatus[row.status] = (byStatus[row.status] ?? 0) + count;
      if (row.ackStatus === 'acknowledged') acknowledged += count;
      if (row.ackStatus === 'disputed') disputed += count;
    }
    const finalized = byStatus.finalized ?? 0;
    if (scope.audience === 'executive')
      return {
        summary: {
          total: null,
          finalized: null,
          completionPercent: null,
          acknowledged: null,
          disputed: null,
          overdue: null,
          activeCycles: null,
          pendingSelf: null,
          pendingManager: null,
          pendingHr: null,
          byStatus: {} as Record<string, number>,
          suppressed: true,
        },
        ratingDistribution: null,
        ratingDistributionStatus:
          'Confidential evaluation aggregates withheld until an organization disclosure policy is approved',
        refreshedAt: new Date().toISOString(),
      };
    const cycleQuery = this.cycles
      .createQueryBuilder('cycle')
      .where('cycle.company_id = :companyId', { companyId: scope.companyId })
      .andWhere("cycle.status NOT IN ('draft','closed')")
      .andWhere(query.cycleId ? 'cycle.id = :cycleId' : '1=1', {
        cycleId: query.cycleId,
      });
    if (scope.employeeIds)
      cycleQuery.andWhere(
        'EXISTS (SELECT 1 FROM phase4_evaluations enrolled WHERE enrolled.cycle_id = cycle.id AND enrolled.company_id = cycle.company_id AND enrolled.employee_id IN (:...cycleEmployeeIds))',
        {
          cycleEmployeeIds: scope.employeeIds.length ? scope.employeeIds : [-1],
        },
      );
    const activeCycles = await cycleQuery.getCount();
    return {
      summary: {
        total,
        finalized,
        completionPercent: query.evaluationStatus
          ? null
          : total
            ? Number(((finalized * 100) / total).toFixed(2))
            : null,
        acknowledged,
        disputed,
        overdue,
        activeCycles,
        pendingSelf: (byStatus.self_draft ?? 0) + (byStatus.self_returned ?? 0),
        pendingManager:
          (byStatus.self_submitted ?? 0) + (byStatus.manager_draft ?? 0),
        pendingHr:
          (byStatus.manager_submitted ?? 0) + (byStatus.hr_reviewed ?? 0),
        byStatus,
      },
      ratingDistribution: null,
      ratingDistributionStatus: 'Combined rating not configured',
      refreshedAt: new Date().toISOString(),
    };
  }

  async trends(actor: AuthenticatedUser, query: KpiAnalyticsQueryDto) {
    const scope = await this.scope(actor, query);
    const employeeId =
      query.employeeId ??
      (scope.audience === 'employee' ? actor.employeeId : undefined);
    if (!query.definitionId || !employeeId)
      throw new BadRequestException(
        'A KPI definition and an authorized employee are required for comparable trends',
      );
    if (scope.audience === 'executive')
      throw new ForbiddenException(
        'Individual trends unavailable to management',
      );
    const rows = await this.assignments
      .createQueryBuilder('a')
      .innerJoin(
        KpiPeriod,
        'p',
        'p.id = a.period_id AND p.company_id = a.company_id',
      )
      .innerJoin(
        KpiDefinitionVersion,
        'v',
        'v.id = a.definition_version_id AND v.company_id = a.company_id',
      )
      .leftJoin(
        KpiAchievement,
        'root',
        'root.assignment_id = a.id AND root.company_id = a.company_id',
      )
      .leftJoin(
        KpiAchievementRevision,
        'approved',
        "approved.id = root.approved_revision_id AND approved.status = 'approved' AND approved.company_id = a.company_id",
      )
      .where(
        'a.company_id = :companyId AND a.subject_type = :type AND a.subject_id = :employeeId AND v.definition_id = :definitionId',
        {
          companyId: scope.companyId,
          type: 'employee',
          employeeId,
          definitionId: query.definitionId,
        },
      )
      .select('a.id', 'assignmentId')
      .addSelect('v.id', 'definitionVersionId')
      .addSelect('v.measurement_type', 'measurementType')
      .addSelect('v.measurement_unit', 'measurementUnit')
      .addSelect('v.direction', 'direction')
      .addSelect('p.id', 'periodId')
      .addSelect('p.label', 'periodLabel')
      .addSelect('p.frequency', 'frequency')
      .addSelect('p.start_date', 'startDate')
      .addSelect('approved.actual', 'actual')
      .addSelect('approved.target_revision_id', 'targetRevisionId')
      .orderBy('p.start_date', 'DESC')
      .limit(24)
      .getRawMany<{
        assignmentId: number;
        definitionVersionId: number;
        measurementType: string;
        measurementUnit: string | null;
        direction: string;
        periodId: number;
        periodLabel: string;
        frequency: string;
        startDate: string;
        actual: unknown;
        targetRevisionId: number | null;
      }>();
    const targets = rows.length
      ? await this.targets.findBy({
          companyId: scope.companyId,
          id: In(
            rows
              .map((row) => Number(row.targetRevisionId))
              .filter((id) => id > 0),
          ),
        })
      : [];
    const reference = rows[0];
    return {
      definitionId: query.definitionId,
      employeeId,
      points: rows.reverse().map((row) => ({
        assignmentId: row.assignmentId,
        periodId: row.periodId,
        periodLabel: row.periodLabel,
        frequency: row.frequency,
        startDate: row.startDate,
        definitionVersionId: row.definitionVersionId,
        targetRevisionId: row.targetRevisionId,
        target:
          targets.find((target) => target.id === Number(row.targetRevisionId))
            ?.target ?? null,
        approvedActual: row.actual,
        comparable:
          !!reference &&
          row.definitionVersionId === reference.definitionVersionId &&
          row.frequency === reference.frequency,
        limitation:
          row.definitionVersionId !== reference?.definitionVersionId ||
          row.frequency !== reference?.frequency
            ? 'Different definition version or reporting frequency'
            : null,
      })),
      refreshedAt: new Date().toISOString(),
    };
  }

  async scorecardTrends(actor: AuthenticatedUser, query: KpiAnalyticsQueryDto) {
    const scope = await this.scope(actor, query);
    if (scope.audience === 'executive')
      throw new ForbiddenException(
        'Individual scorecard history unavailable to management',
      );
    const employeeId =
      query.employeeId ??
      (scope.audience === 'employee' ? actor.employeeId : undefined);
    if (!employeeId)
      throw new BadRequestException('An authorized employee is required');
    const qb = this.scorecardRows
      .createQueryBuilder('s')
      .innerJoin(
        KpiPeriod,
        'period',
        'period.id = s.period_id AND period.company_id = s.company_id',
      )
      .where(
        's.company_id = :companyId AND s.subject_type = :type AND s.subject_id = :employeeId',
        { companyId: scope.companyId, type: 'employee', employeeId },
      )
      .andWhere("s.status <> 'archived'")
      .andWhere(
        'EXISTS (SELECT 1 FROM phase2_scorecard_versions published WHERE published.scorecard_id = s.id AND published.company_id = s.company_id AND published.published_at IS NOT NULL)',
      );
    if (query.periodId)
      qb.andWhere('s.period_id = :periodId', { periodId: query.periodId });
    const rows = await qb
      .orderBy('period.start_date', 'DESC')
      .addOrderBy('s.id', 'DESC')
      .limit(24)
      .getMany();
    const details = await this.scorecardDetails(actor, rows);
    const reference = details.find(
      (detail) =>
        detail.currentVersion.publishedAt &&
        detail.performanceStatus === 'scored' &&
        detail.currentVersion.mode === 'weighted' &&
        detail.currentVersion.policyVersionId,
    );
    const referenceSignature = reference
      ? this.signature(reference.currentVersion.entries)
      : null;
    const finalized =
      ['admin', 'employee'].includes(scope.audience) && rows.length
        ? await this.evaluationRows.find({
            where: {
              companyId: scope.companyId,
              scorecardId: In(rows.map((row) => row.id)),
              status: 'finalized',
            },
            order: { finalizedAt: 'DESC' },
          })
        : [];
    return {
      employeeId,
      policyVersionId: reference?.currentVersion.policyVersionId ?? null,
      points: details.reverse().map((detail) => {
        const historical = finalized.find(
          (evaluation) => evaluation.scorecardId === detail.id,
        );
        const snapshot = historical?.finalSnapshot?.scorecard as
          | { overallScore?: unknown; rating?: unknown }
          | undefined;
        const comparable =
          !!reference &&
          !!detail.currentVersion.publishedAt &&
          detail.performanceStatus === 'scored' &&
          detail.currentVersion.mode === 'weighted' &&
          detail.currentVersion.policyVersionId ===
            reference.currentVersion.policyVersionId &&
          this.signature(detail.currentVersion.entries) === referenceSignature;
        return {
          scorecardId: detail.id,
          periodId: detail.periodId,
          periodLabel: detail.period.label,
          scorecardVersionId: detail.currentVersion.id,
          policyVersionId: detail.currentVersion.policyVersionId,
          completenessPercent: detail.completenessPercent,
          liveScore: comparable ? detail.overallScore : null,
          finalizedScore:
            typeof snapshot?.overallScore === 'string' ||
            typeof snapshot?.overallScore === 'number'
              ? String(snapshot.overallScore)
              : null,
          finalizedAt: historical?.finalizedAt ?? null,
          comparable,
          reason: comparable
            ? null
            : !detail.currentVersion.publishedAt
              ? 'Latest configuration is a draft'
              : detail.performanceStatus !== 'scored'
                ? 'Approved KPI data is incomplete'
                : 'Definition versions, weights, or scoring policy differ',
        };
      }),
      note: 'Live scores and frozen finalized appraisal scores are separate. Only complete scorecards with identical KPI definition versions, weights, and policy version are compared.',
      refreshedAt: new Date().toISOString(),
    };
  }

  async comparisons(actor: AuthenticatedUser, query: KpiAnalyticsQueryDto) {
    const scope = await this.scope(actor, query);
    if (!['admin', 'executive'].includes(scope.audience))
      throw new ForbiddenException(
        'Organization comparisons require company scope',
      );
    if (!query.periodId || !query.comparisonType)
      throw new BadRequestException(
        'Reporting period and department or branch type are required',
      );
    const limit = query.limit ?? 20;
    const page = query.page ?? 1;
    const comparisonQuery = this.scorecardRows
      .createQueryBuilder('s')
      .where(
        's.company_id = :companyId AND s.period_id = :periodId AND s.subject_type = :type',
        {
          companyId: scope.companyId,
          periodId: query.periodId,
          type: query.comparisonType,
        },
      )
      .andWhere("s.status <> 'archived'")
      .andWhere(
        'EXISTS (SELECT 1 FROM phase2_scorecard_versions published WHERE published.scorecard_id = s.id AND published.company_id = s.company_id AND published.published_at IS NOT NULL)',
      )
      .orderBy('s.id', 'ASC');
    if (query.departmentId)
      comparisonQuery.andWhere(
        query.comparisonType === 'department'
          ? 's.subject_id = :departmentId'
          : "(s.organization_snapshot->>'departmentId')::int = :departmentId",
        { departmentId: query.departmentId },
      );
    if (query.branchId)
      comparisonQuery.andWhere(
        query.comparisonType === 'branch'
          ? 's.subject_id = :branchId'
          : "(s.organization_snapshot->>'branchId')::int = :branchId",
        { branchId: query.branchId },
      );
    const [rows, total] = await comparisonQuery
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    if (scope.audience === 'executive')
      return {
        periodId: query.periodId,
        comparisonType: query.comparisonType,
        total,
        page,
        limit,
        policyVersionId: null,
        rows: rows.map((row) => ({
          id: row.id,
          name: 'Scorecard withheld',
          subjectId: row.subjectId,
          completenessPercent: null,
          score: null,
          comparable: false,
          reason: 'Group performance withheld pending a disclosure policy',
        })),
        note: 'Group scores are withheld pending an approved disclosure policy.',
        refreshedAt: new Date().toISOString(),
      };
    const details = await this.scorecardDetails(actor, rows);
    const reference = details.find(
      (detail) =>
        detail.performanceStatus === 'scored' &&
        detail.currentVersion.mode === 'weighted' &&
        detail.currentVersion.policyVersionId,
    );
    const referenceSignature = reference
      ? this.signature(reference.currentVersion.entries)
      : null;
    return {
      periodId: query.periodId,
      comparisonType: query.comparisonType,
      total,
      page,
      limit,
      policyVersionId: reference?.currentVersion.policyVersionId ?? null,
      rows: details.map((detail) => {
        const comparable =
          detail.performanceStatus === 'scored' &&
          detail.currentVersion.mode === 'weighted' &&
          !!reference &&
          detail.currentVersion.policyVersionId ===
            reference.currentVersion.policyVersionId &&
          this.signature(detail.currentVersion.entries) === referenceSignature;
        return {
          id: detail.id,
          name: detail.currentVersion.name,
          subjectId: detail.subjectId,
          completenessPercent: detail.completenessPercent,
          score: comparable ? detail.overallScore : null,
          comparable,
          reason: comparable
            ? null
            : detail.performanceStatus !== 'scored'
              ? 'Required approved data is incomplete'
              : detail.currentVersion.mode !== 'weighted'
                ? 'Strategic status-only scorecard'
                : detail.currentVersion.policyVersionId !==
                    reference?.currentVersion.policyVersionId
                  ? 'Scoring policy differs from comparison group'
                  : 'KPI definition versions or weights differ from comparison group',
        };
      }),
      note: 'Scores are shown only for complete weighted scorecards using the same period, policy version, KPI definition versions, and weights. No rank is assigned.',
      refreshedAt: new Date().toISOString(),
    };
  }

  async team(actor: AuthenticatedUser, query: KpiAnalyticsQueryDto) {
    const scope = await this.scope(actor, query);
    if (scope.audience !== 'manager')
      throw new ForbiddenException('Manager reporting scope required');
    const limit = query.limit ?? 20;
    const page = query.page ?? 1;
    const ids = scope.employeeIds?.length ? scope.employeeIds : [-1];
    const qb = this.employees
      .createQueryBuilder('employee')
      .where('employee.company_id = :companyId AND employee.id IN (:...ids)', {
        companyId: scope.companyId,
        ids,
      });
    if (query.departmentId)
      qb.andWhere('employee.primary_department_id = :departmentId', {
        departmentId: query.departmentId,
      });
    if (query.branchId)
      qb.andWhere('employee.primary_branch_id = :branchId', {
        branchId: query.branchId,
      });
    const [employees, total] = await qb
      .orderBy('employee.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const pageIds = employees.map((employee) => employee.id);
    const assignmentQuery = this.assignments
      .createQueryBuilder('a')
      .innerJoin(
        KpiDefinitionVersion,
        'v',
        'v.id = a.definition_version_id AND v.company_id = a.company_id',
      )
      .leftJoin(
        KpiAchievement,
        'root',
        'root.assignment_id = a.id AND root.company_id = a.company_id',
      )
      .leftJoin(
        KpiAchievementRevision,
        'approved',
        "approved.id = root.approved_revision_id AND approved.company_id = a.company_id AND approved.status = 'approved'",
      )
      .leftJoin(
        KpiAchievementRevision,
        'latest',
        'latest.id = root.latest_revision_id AND latest.company_id = a.company_id',
      );
    this.applyAssignmentScope(assignmentQuery, scope, query);
    const assignments = pageIds.length
      ? await assignmentQuery
          .andWhere(
            'a.subject_type = :type AND a.subject_id IN (:...pageIds) AND a.status = :status',
            {
              type: 'employee',
              pageIds,
              status: 'active',
            },
          )
          .select('a.subject_id', 'employeeId')
          .addSelect('COUNT(*)', 'total')
          .addSelect('COUNT(approved.id)', 'approved')
          .groupBy('a.subject_id')
          .getRawMany<{ employeeId: number; total: string; approved: string }>()
      : [];
    const evaluations = pageIds.length
      ? await this.evaluationRows.find({
          where: {
            companyId: scope.companyId,
            employeeId: In(pageIds),
            ...(query.cycleId ? { cycleId: query.cycleId } : {}),
            ...(query.evaluationStatus
              ? { status: query.evaluationStatus }
              : {}),
          },
          order: { updatedAt: 'DESC' },
        })
      : [];
    const teamScorecards = pageIds.length
      ? await this.scorecardRows
          .createQueryBuilder('s')
          .where(
            's.company_id = :companyId AND s.subject_type = :type AND s.subject_id IN (:...pageIds)',
            { companyId: scope.companyId, type: 'employee', pageIds },
          )
          .andWhere("s.status <> 'archived'")
          .andWhere(
            'EXISTS (SELECT 1 FROM phase2_scorecard_versions published WHERE published.scorecard_id = s.id AND published.company_id = s.company_id AND published.published_at IS NOT NULL)',
          )
          .andWhere(query.periodId ? 's.period_id = :periodId' : '1=1', {
            periodId: query.periodId,
          })
          .distinctOn(['s.subject_id'])
          .orderBy('s.subject_id', 'ASC')
          .addOrderBy('s.updated_at', 'DESC')
          .getMany()
      : [];
    const teamDetails = await this.scorecardDetails(actor, teamScorecards);
    const teamScores = teamScorecards.map((row, index) => {
      const detail = teamDetails[index];
      return {
        employeeId: row.subjectId,
        scorecardId: row.id,
        scorecardStatus: detail.performanceStatus,
        scorecardScore:
          detail.performanceStatus === 'scored' ? detail.overallScore : null,
      };
    });
    return {
      rows: employees.map((employee) => {
        const count = assignments.find(
          (row) => Number(row.employeeId) === employee.id,
        );
        return {
          employeeId: employee.id,
          name: `${employee.first_name} ${employee.last_name}`,
          departmentId: employee.primary_department_id,
          branchId: employee.primary_branch_id,
          assignedKpis: Number(count?.total ?? 0),
          approvedKpis: Number(count?.approved ?? 0),
          completenessPercent: Number(count?.total)
            ? Number(
                (
                  (Number(count?.approved) / Number(count?.total)) *
                  100
                ).toFixed(2),
              )
            : null,
          evaluationStatus:
            evaluations.find((row) => row.employeeId === employee.id)?.status ??
            null,
          scorecardId:
            teamScores.find((row) => row.employeeId === employee.id)
              ?.scorecardId ?? null,
          scorecardScore:
            teamScores.find((row) => row.employeeId === employee.id)
              ?.scorecardScore ?? null,
          scorecardStatus:
            teamScores.find((row) => row.employeeId === employee.id)
              ?.scorecardStatus ?? null,
        };
      }),
      total,
      page,
      limit,
      refreshedAt: new Date().toISOString(),
    };
  }

  async ratings(actor: AuthenticatedUser, query: KpiAnalyticsQueryDto) {
    const scope = await this.scope(actor, query);
    if (scope.audience !== 'admin')
      throw new ForbiddenException(
        'Confidential appraisal distributions require HR authority',
      );
    if (query.evaluationStatus && query.evaluationStatus !== 'finalized')
      return {
        kpi: [],
        competency: [],
        combined: null,
        combinedStatus: 'Combined rating not configured',
        note: 'Rating distributions require finalized evaluations.',
        refreshedAt: new Date().toISOString(),
      };
    const params: number[] = [scope.companyId];
    const clauses = ['e.company_id = $1', "e.status = 'finalized'"];
    if (query.cycleId) {
      params.push(query.cycleId);
      clauses.push(`e.cycle_id = $${params.length}`);
    }
    if (query.periodId) {
      params.push(query.periodId);
      clauses.push(`cycle.period_id = $${params.length}`);
    }
    if (query.departmentId) {
      params.push(query.departmentId);
      clauses.push(
        `(e.organization_snapshot->>'departmentId')::int = $${params.length}`,
      );
    }
    if (query.branchId) {
      params.push(query.branchId);
      clauses.push(
        `(e.organization_snapshot->>'branchId')::int = $${params.length}`,
      );
    }
    if (query.employeeId) {
      params.push(query.employeeId);
      clauses.push(`e.employee_id = $${params.length}`);
    }
    if (query.managerId) {
      params.push(query.managerId);
      clauses.push(`e.manager_employee_id = $${params.length}`);
    }
    const where = clauses.join(' AND ');
    const kpi: Array<{
      policyVersionId: string | null;
      rating: string;
      count: number;
    }> = await this.evaluationRows.query(
      `SELECT e.final_snapshot->>'policyVersionId' AS "policyVersionId",
              e.final_snapshot->'scorecard'->>'rating' AS rating, COUNT(*)::int AS count
       FROM phase4_evaluations e
       JOIN phase4_evaluation_cycles cycle ON cycle.id = e.cycle_id AND cycle.company_id = e.company_id
       WHERE ${where} AND e.final_snapshot->'scorecard'->>'rating' IS NOT NULL
       GROUP BY 1, 2 ORDER BY 1, 2`,
      params,
    );
    const competency: Array<{
      templateVersionId: number;
      rating: string;
      count: number;
    }> = await this.evaluationRows.query(
      `SELECT e.template_version_id AS "templateVersionId", response.rating AS rating, COUNT(*)::int AS count
       FROM phase4_evaluations e
       JOIN phase4_evaluation_cycles cycle ON cycle.id = e.cycle_id AND cycle.company_id = e.company_id
       CROSS JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(e.final_snapshot->'competencyResult') = 'object' THEN e.final_snapshot->'competencyResult' ELSE '{}'::jsonb END) AS response(code, rating)
       WHERE ${where}
       GROUP BY 1, 2 ORDER BY 1, 2`,
      params,
    );
    return {
      kpi,
      competency,
      combined: null,
      combinedStatus: 'Combined rating not configured',
      note: 'Competency counts are responses, not employees. KPI ratings are grouped by scoring-policy version.',
      refreshedAt: new Date().toISOString(),
    };
  }
}
