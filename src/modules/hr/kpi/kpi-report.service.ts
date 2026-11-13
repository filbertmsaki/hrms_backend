import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Company } from '../../companies/entities/company.entity';
import { Employee } from '../employees/entities/employee.entity';
import { KpiAchievement, KpiAchievementEvidence } from './achievement.entities';
import { KpiAnalyticsQueryDto } from './dto/kpi-analytics.dto';
import { EvaluationCycle, PerformanceEvaluation } from './evaluation.entities';
import { KpiAnalyticsService } from './kpi-analytics.service';

export type KpiReportKind =
  | 'individual'
  | 'department'
  | 'branch'
  | 'hr'
  | 'executive';
export type KpiReportRow = Record<string, string | number | null>;
export type KpiReportSection = {
  title: string;
  columns: string[];
  rows: KpiReportRow[];
  note?: string;
};
export type KpiReportDocument = {
  kind: KpiReportKind;
  title: string;
  company: string;
  generatedAt: string;
  period: string;
  filters: Record<string, string | number>;
  page: number;
  pageSize: number;
  summary: string[];
  sections: KpiReportSection[];
  limitations: string[];
};
type ReportCard = {
  id: number;
  name: string;
  subjectType: string;
  subjectId: number;
  periodLabel: string;
  performanceStatus: string;
  completenessPercent: string | null;
  overallScore: string | null;
  rating: string | null;
  entries: Array<{
    achievementId: number | null;
    kpiName: string;
    target: unknown;
    actual: unknown;
    weight: string;
    scoredAchievement: string | null;
    weightedContribution: string | null;
    status: string;
  }>;
};

const managingRoles = ['COMPANY_ADMIN', 'HR_MANAGER'];

function display(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value as string | number | boolean);
}

function statusLabel(value: string): string {
  if (value === 'total') return 'Total assignments';
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

@Injectable()
export class KpiReportService {
  constructor(
    private readonly analytics: KpiAnalyticsService,
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(KpiAchievement)
    private readonly achievements: Repository<KpiAchievement>,
    @InjectRepository(KpiAchievementEvidence)
    private readonly evidence: Repository<KpiAchievementEvidence>,
    @InjectRepository(PerformanceEvaluation)
    private readonly evaluations: Repository<PerformanceEvaluation>,
  ) {}

  async create(
    actor: AuthenticatedUser,
    kind: KpiReportKind,
    filters: KpiAnalyticsQueryDto,
  ): Promise<KpiReportDocument> {
    const admin = actor.roles.some((role) => managingRoles.includes(role));
    const manager = actor.roles.some((role) =>
      ['DEPARTMENT_MANAGER', 'BRANCH_MANAGER'].includes(role),
    );
    const executive = actor.roles.includes('MANAGEMENT') && !admin && !manager;
    if (kind === 'hr' && !admin)
      throw new ForbiddenException('HR report access required');
    if (kind === 'executive' && !admin && !executive)
      throw new ForbiddenException('Executive report access required');
    if (['department', 'branch'].includes(kind) && !admin && !manager)
      throw new ForbiddenException('Organizational report access required');
    if (kind === 'individual' && executive)
      throw new ForbiddenException('Individual reports are confidential');
    const query = {
      ...filters,
      page: filters.page ?? 1,
      limit: Math.min(filters.limit ?? 20, 20),
    };
    if (kind === 'individual') {
      if (!admin && !manager) {
        if (filters.employeeId && filters.employeeId !== actor.employeeId)
          throw new ForbiddenException(
            'Another employee report is not permitted',
          );
        query.employeeId = actor.employeeId;
      }
      if (!query.employeeId)
        throw new ForbiddenException('An authorized employee is required');
    }
    const overview = await this.analytics.overview(actor, query);
    const coverage = await this.analytics.coverage(actor, query);
    const scorecards = (await this.analytics.scorecards(
      actor,
      query,
    )) as unknown as { rows: ReportCard[]; total: number };
    const evaluation = await this.analytics.evaluations(actor, query);
    const company = actor.companyId
      ? await this.companies.findOneBy({ id: actor.companyId })
      : null;
    const subject =
      kind === 'individual' && query.employeeId
        ? await this.employees.findOneBy({
            id: query.employeeId,
            company_id: actor.companyId,
          })
        : null;
    const report: KpiReportDocument = {
      kind,
      title: (
        {
          individual: 'Individual KPI performance',
          department: 'Department KPI performance',
          branch: 'Branch KPI performance',
          hr: 'HR evaluation',
          executive: 'Executive KPI coverage',
        } as const
      )[kind],
      company: company?.name ?? actor.companyName ?? 'Company',
      generatedAt: new Date().toISOString(),
      period: filters.periodId
        ? `Reporting period #${filters.periodId}`
        : 'All authorized periods',
      filters: Object.fromEntries(
        Object.entries(filters)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, value as string | number]),
      ),
      page: query.page,
      pageSize: query.limit,
      summary: [],
      sections: [],
      limitations: [],
    };
    if (subject)
      report.summary.push(
        `Employee: ${subject.first_name} ${subject.last_name} (#${subject.id}).`,
      );
    report.summary.push(
      `${overview.assignments.total} KPI assignments in scope; ${overview.assignments.approved} have approved achievements, ${overview.assignments.pending} await review, and ${overview.assignments.missing} have no submission.`,
    );
    if (!coverage.suppressed) {
      report.summary.push(
        `${coverage.employeesWithScorecards} of ${coverage.eligibleEmployees} eligible employees have a published scorecard; ${coverage.completeScorecards} of ${coverage.scorecards} scorecards have all required approved results.`,
      );
      report.summary.push(
        `${coverage.finalizedEvaluations} evaluations are finalized; ${coverage.evaluationsInProgress} remain in progress.`,
      );
    } else
      report.limitations.push(
        coverage.reason ?? 'Coverage withheld by disclosure policy.',
      );
    if (kind === 'executive') {
      report.limitations.push(
        'Individual appraisal details and group scores are withheld pending an approved disclosure policy. Overall performance index not configured.',
      );
    } else {
      report.sections.push({
        title: 'Assignment and approval status',
        columns: ['Status', 'Count'],
        rows: Object.entries(overview.assignments).map(([status, count]) => ({
          Status: statusLabel(status),
          Count: count,
        })),
      });
      report.sections.push({
        title: 'Scorecards (current page)',
        columns: [
          'Scorecard',
          'Subject',
          'Period',
          'Status',
          'Completeness',
          'Live score',
          'Rating',
        ],
        rows: scorecards.rows.map((row) => ({
          Scorecard: row.name,
          Subject: `${row.subjectType} #${row.subjectId}`,
          Period: row.periodLabel,
          Status: row.performanceStatus,
          Completeness:
            row.completenessPercent == null
              ? '—'
              : `${row.completenessPercent}%`,
          'Live score':
            row.performanceStatus === 'scored'
              ? display(row.overallScore)
              : 'Awaiting approved data',
          Rating:
            row.performanceStatus === 'scored' ? display(row.rating) : '—',
        })),
        note: `${scorecards.total} scorecards match. Page ${query.page}; ${query.limit} per page. Live results may change after approval.`,
      });
    }
    if (kind === 'individual') {
      const scopedRows = scorecards.rows.filter(
        (row) =>
          row.subjectType === 'employee' && row.subjectId === query.employeeId,
      );
      const achievementIds = scopedRows.flatMap((row) =>
        row.entries
          .map((entry) => entry.achievementId)
          .filter((id): id is number => typeof id === 'number'),
      );
      const approved = achievementIds.length
        ? await this.achievements.find({
            where: { id: In(achievementIds), companyId: actor.companyId },
          })
        : [];
      const approvedRevisionIds = approved
        .map((row) => row.approvedRevisionId)
        .filter((id): id is number => typeof id === 'number');
      const attachments = approvedRevisionIds.length
        ? await this.evidence.find({
            where: {
              companyId: actor.companyId,
              revisionId: In(approvedRevisionIds),
            },
          })
        : [];
      const byAchievement = new Map(
        approved.map((row) => [row.id, row.approvedRevisionId]),
      );
      report.sections.push({
        title: 'Assigned KPI results (approved actuals only)',
        columns: [
          'Scorecard',
          'KPI',
          'Target',
          'Approved actual',
          'Weight',
          'Achievement',
          'Weighted score',
          'Status',
          'Evidence',
        ],
        rows: scopedRows.flatMap((card) =>
          card.entries.map((entry) => ({
            Scorecard: card.name,
            KPI: entry.kpiName,
            Target: display(entry.target),
            'Approved actual':
              entry.status === 'scored' ? display(entry.actual) : '—',
            Weight: `${entry.weight}%`,
            Achievement:
              entry.status === 'scored'
                ? display(entry.scoredAchievement)
                : '—',
            'Weighted score':
              entry.status === 'scored'
                ? display(entry.weightedContribution)
                : '—',
            Status: entry.status,
            Evidence:
              attachments
                .filter(
                  (file) =>
                    file.revisionId ===
                    byAchievement.get(entry.achievementId ?? -1),
                )
                .map((file) => `#${file.id} ${file.fileName}`)
                .join(', ') || '—',
          })),
        ),
        note: 'Evidence identifiers refer to private files. Open the authorized achievement detail to download them.',
      });
      const finalQuery = this.evaluations
        .createQueryBuilder('evaluation')
        .innerJoin(
          EvaluationCycle,
          'cycle',
          'cycle.id = evaluation.cycle_id AND cycle.company_id = evaluation.company_id',
        )
        .where(
          'evaluation.company_id = :companyId AND evaluation.employee_id = :employeeId AND evaluation.status = :status',
          {
            companyId: actor.companyId,
            employeeId: query.employeeId,
            status: 'finalized',
          },
        );
      if (query.cycleId)
        finalQuery.andWhere('evaluation.cycle_id = :cycleId', {
          cycleId: query.cycleId,
        });
      if (query.periodId)
        finalQuery.andWhere('cycle.period_id = :periodId', {
          periodId: query.periodId,
        });
      const finalRows = await finalQuery
        .orderBy('evaluation.finalizedAt', 'DESC')
        .limit(24)
        .getMany();
      report.sections.push({
        title: 'Finalized evaluation history',
        columns: [
          'Evaluation',
          'Cycle',
          'Finalized',
          'Frozen KPI score',
          'KPI rating',
          'Manager employee ID',
          'HR reviewer ID',
          'Acknowledgement',
        ],
        rows: finalRows.map((row) => ({
          Evaluation: row.id,
          Cycle: row.cycleId,
          Finalized: row.finalizedAt?.toISOString() ?? '—',
          'Frozen KPI score': display(
            (
              row.finalSnapshot?.scorecard as
                | { overallScore?: unknown }
                | undefined
            )?.overallScore,
          ),
          'KPI rating': display(
            (row.finalSnapshot?.scorecard as { rating?: unknown } | undefined)
              ?.rating,
          ),
          'Manager employee ID': row.managerEmployeeId,
          'HR reviewer ID': row.hrReviewerCompanyUserId,
          Acknowledgement: row.ackStatus ?? 'Pending',
        })),
        note: 'These values come from finalized snapshots and do not change with later live scorecard corrections.',
      });
    }
    if (kind === 'hr')
      report.sections.push({
        title: 'Evaluation workflow',
        columns: ['Status', 'Count'],
        rows: Object.entries(evaluation.summary.byStatus).map(
          ([status, count]) => ({ Status: statusLabel(status), Count: count }),
        ),
        note: `${evaluation.summary.acknowledged} acknowledged, ${evaluation.summary.disputed} disputed, ${evaluation.summary.overdue} overdue. Finalized ${evaluation.summary.finalized} of ${evaluation.summary.total} enrolled evaluations.`,
      });
    if (scorecards.total > query.page * query.limit)
      report.limitations.push(
        'Scorecard detail is paginated. Export additional pages to obtain all matching rows.',
      );
    report.limitations.push(
      'No company-wide performance index or time-based risk status is calculated without an approved policy.',
    );
    return report;
  }
}
