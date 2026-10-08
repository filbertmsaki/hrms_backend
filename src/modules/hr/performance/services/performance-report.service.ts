import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { KpiAchievement } from '../entities/kpi-achievement.entity';
import { PerformanceDevelopmentGoal } from '../entities/performance-development-goal.entity';
import { PerformanceDevelopmentPlan } from '../entities/performance-development-plan.entity';
import { PerformanceFeedback360Request } from '../entities/performance-feedback-360-request.entity';
import { PerformanceImprovementPlan } from '../entities/performance-improvement-plan.entity';
import { PerformanceReview } from '../entities/performance-review.entity';
import { PerformanceImprovementMilestoneStatusEnum } from '../enums/performance-improvement-milestone-status.enum';
import { EmployeeKpi } from '../entities/employee-kpi.entity';
import { EmployeeKpiCycleReview } from '../entities/employee-kpi-cycle-review.entity';
import { EmployeeKpiCycleScore } from '../entities/employee-kpi-cycle-score.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import { KpiDefinition } from '../entities/kpi-definition.entity';
import { KpiDefinitionVersion } from '../entities/kpi-definition-version.entity';
import { PerformanceAuditLog } from '../entities/performance-audit-log.entity';
import { EmployeeKpiStatusEnum } from '../enums/employee-kpi-status.enum';
import { kpiCycleToday } from '../utils/kpi-cycle-date';

export type PerformanceReportFormat = 'json' | 'csv' | 'xlsx' | 'pdf';

type ReportRow = Record<string, string | number | null>;

const REPORTS = [
  {
    code: 'KPI_MY_SCORECARD',
    name: 'My scorecard',
    description: 'My cycle KPIs, reviews, and score.',
  },
  {
    code: 'KPI_TEAM_SCORECARD',
    name: 'Team scorecard',
    description: 'Reporting-tree KPI scores and progress.',
  },
  {
    code: 'KPI_CYCLE_HEALTH',
    name: 'Cycle health',
    description: 'Completion and overdue KPI review counts.',
  },
  {
    code: 'KPI_MASTER_USAGE',
    name: 'Master usage',
    description: 'KPI definition assignment counts.',
  },
  {
    code: 'KPI_CYCLE_COMPARISON',
    name: 'Cycle comparison',
    description: 'Employee scores across cycles.',
  },
  {
    code: 'KPI_AUDIT',
    name: 'KPI audit',
    description: 'KPI state changes and overrides.',
  },
  {
    code: 'KPI_PROGRESS',
    name: 'KPI progress',
    description: 'Employee KPI achievement values, scores, and statuses.',
  },
  {
    code: 'APPRAISAL_STATUS',
    name: 'Appraisal status',
    description: 'Review status, final scores, and rating codes.',
  },
  {
    code: 'SCORE_DISTRIBUTION',
    name: 'Score distribution',
    description: 'Published review score bands by rating code.',
  },
  {
    code: 'PIP_STATUS',
    name: 'PIP status',
    description: 'Performance improvement plans and milestone counts.',
  },
  {
    code: 'DEVELOPMENT_PLANS',
    name: 'Development plans',
    description:
      'Employee development plans, goals, progress, and carry-forward state.',
  },
  {
    code: 'FEEDBACK_360',
    name: '360 feedback',
    description: '360 feedback invitation, submission, and score summary.',
  },
] as const;

@Injectable()
export class PerformanceReportService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(KpiAchievement)
    private readonly achievementRepository: Repository<KpiAchievement>,
    @InjectRepository(PerformanceReview)
    private readonly reviewRepository: Repository<PerformanceReview>,
    @InjectRepository(PerformanceImprovementPlan)
    private readonly pipRepository: Repository<PerformanceImprovementPlan>,
    @InjectRepository(PerformanceDevelopmentPlan)
    private readonly developmentPlanRepository: Repository<PerformanceDevelopmentPlan>,
    @InjectRepository(PerformanceFeedback360Request)
    private readonly feedback360Repository: Repository<PerformanceFeedback360Request>,
    @InjectRepository(EmployeeKpi)
    private readonly employeeKpis: Repository<EmployeeKpi>,
    @InjectRepository(EmployeeKpiCycleReview)
    private readonly cycleReviews: Repository<EmployeeKpiCycleReview>,
    @InjectRepository(EmployeeKpiCycleScore)
    private readonly cycleScores: Repository<EmployeeKpiCycleScore>,
    @InjectRepository(PerformancePeriod)
    private readonly periods: Repository<PerformancePeriod>,
    @InjectRepository(KpiDefinition)
    private readonly definitions: Repository<KpiDefinition>,
    @InjectRepository(KpiDefinitionVersion)
    private readonly definitionVersions: Repository<KpiDefinitionVersion>,
    @InjectRepository(PerformanceAuditLog)
    private readonly auditLogs: Repository<PerformanceAuditLog>,
  ) {}

  catalog() {
    return REPORTS;
  }

  async ownKpiAudit(actor: AuthenticatedUser): Promise<ReportRow[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.employeeId) return [];
    const logs = await this.auditLogs.find({
      where: { companyId, employeeId: actor.employeeId },
      order: { id: 'DESC' },
      take: 1000,
    });
    return logs
      .filter((log) => log.action.toLowerCase().includes('kpi'))
      .map((log) => ({
        id: log.id,
        action: log.action,
        reason: log.reason,
        at: log.createdAt.toISOString(),
      }));
  }

  async rows(
    actor: AuthenticatedUser,
    reportCode: string,
  ): Promise<ReportRow[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const code = reportCode.trim().toUpperCase();

    if (code.startsWith('KPI_') && code !== 'KPI_PROGRESS') {
      const orgScope = this.hrAccessService.hasCompanyScope(actor);
      const reportees = orgScope
        ? null
        : await this.hrAccessService.getReportingEmployeeIds(actor);
      const ownId = actor.employeeId;
      if (code === 'KPI_MY_SCORECARD') {
        if (!ownId) return [];
        return this.scorecardRows(companyId, [ownId]);
      }
      if (code === 'KPI_TEAM_SCORECARD')
        return this.scorecardRows(companyId, reportees ?? undefined);
      if (
        !orgScope &&
        ['KPI_CYCLE_HEALTH', 'KPI_MASTER_USAGE', 'KPI_AUDIT'].includes(code)
      )
        throw new BadRequestException(
          'This report requires organization scope.',
        );
      if (code === 'KPI_CYCLE_COMPARISON') {
        const scores = await this.cycleScores.find({
          where: {
            companyId,
            ...(reportees === null
              ? {}
              : { employeeId: In(reportees.length ? reportees : [-1]) }),
          },
          order: { performancePeriodId: 'ASC', employeeId: 'ASC' },
        });
        return scores.map((score) => ({
          employee_id: score.employeeId,
          cycle_id: score.performancePeriodId,
          score: score.totalWeightedScore,
          rating: score.finalRatingBand,
          status: score.status,
          revision: score.revision,
        }));
      }
      if (code === 'KPI_CYCLE_HEALTH') {
        const periods = await this.periods.find({ where: { companyId } });
        const kpis = await this.employeeKpis.find({ where: { companyId } });
        const reviews = await this.cycleReviews.find({ where: { companyId } });
        return periods.map((period) => {
          const cycleKpis = kpis.filter(
            (kpi) =>
              kpi.performancePeriodId === period.id &&
              kpi.status !== EmployeeKpiStatusEnum.REJECTED,
          );
          const finals = reviews.filter(
            (review) =>
              review.performancePeriodId === period.id &&
              review.kind === 'FINAL',
          );
          const pendingApproval = cycleKpis.filter(
            (kpi) => kpi.status !== EmployeeKpiStatusEnum.APPROVED,
          ).length;
          const finalPending =
            cycleKpis.length -
            finals.filter((review) => review.status === 'FINALIZED').length;
          const today = kpiCycleToday();
          const overdueApprovals =
            period.goalSettingDeadline && today > period.goalSettingDeadline
              ? pendingApproval
              : 0;
          const overdueFinalReviews =
            period.finalReviewDeadline && today > period.finalReviewDeadline
              ? finalPending
              : 0;
          return {
            cycle_id: period.id,
            cycle: period.name,
            phase: period.kpiPhase,
            assignments: cycleKpis.length,
            pending_approval: pendingApproval,
            final_review_pending: finalPending,
            overdue_approvals: overdueApprovals,
            overdue_final_reviews: overdueFinalReviews,
            escalations: overdueApprovals + overdueFinalReviews,
            completion_percent: cycleKpis.length
              ? Math.round(
                  (finals.filter((review) => review.status === 'FINALIZED')
                    .length *
                    100) /
                    cycleKpis.length,
                )
              : 0,
          };
        });
      }
      if (code === 'KPI_MASTER_USAGE') {
        const definitions = await this.definitions.find({
          where: { companyId },
        });
        const versions = await this.definitionVersions.find({
          where: {
            kpiDefinitionId: In(
              definitions.length
                ? definitions.map((definition) => definition.id)
                : [-1],
            ),
          },
        });
        const kpis = await this.employeeKpis.find({ where: { companyId } });
        return definitions.map((definition) => ({
          code: definition.code,
          name: definition.name,
          category: definition.category,
          assignment_count: kpis.filter((kpi) =>
            versions.some(
              (version) =>
                version.id === kpi.kpiDefinitionVersionId &&
                version.kpiDefinitionId === definition.id,
            ),
          ).length,
        }));
      }
      if (code === 'KPI_AUDIT') {
        const logs = await this.auditLogs.find({
          where: { companyId },
          order: { id: 'DESC' },
          take: 5000,
        });
        return logs
          .filter((log) => log.action.toLowerCase().includes('kpi'))
          .map((log) => ({
            id: log.id,
            action: log.action,
            employee_id: log.employeeId,
            actor_company_user_id: log.actorCompanyUserId,
            actor_roles: log.actorRoles.join(', '),
            before: JSON.stringify(log.beforeValues),
            after: JSON.stringify(log.afterValues),
            reason: log.reason,
            ip_address: log.ipAddress,
            at: log.createdAt.toISOString(),
          }));
      }
    }

    const scopedEmployeeIds = this.hrAccessService.hasCompanyScope(actor)
      ? null
      : await this.hrAccessService.getReportingEmployeeIds(actor);
    const visible = (employeeId: number) =>
      scopedEmployeeIds === null || scopedEmployeeIds.includes(employeeId);

    if (code === 'KPI_PROGRESS') {
      const rows = await this.achievementRepository.find({
        where: { companyId },
        order: { id: 'DESC' },
      });
      return rows
        .filter((row) => visible(row.employeeId))
        .map((row) => ({
          id: row.id,
          employee_id: row.employeeId,
          period_assignment_id: row.periodAssignmentId,
          target_value: row.targetValue,
          achievement_value: row.achievementValue,
          raw_score: row.rawScore,
          weighted_score: row.weightedScore,
          status: row.status,
          submitted_at: row.submittedAt?.toISOString() ?? null,
        }));
    }

    if (code === 'APPRAISAL_STATUS') {
      const rows = await this.reviewRepository.find({
        where: { companyId },
        order: { id: 'DESC' },
      });
      return rows
        .filter((row) => visible(row.employeeId))
        .map((row) => ({
          id: row.id,
          employee_id: row.employeeId,
          period_id: row.performancePeriodId,
          status: row.status,
          kpi_score: row.kpiScore,
          competency_score: row.competencyScore,
          final_score: row.finalScore,
          rating_code: row.ratingCode,
          published_at: row.publishedAt?.toISOString() ?? null,
        }));
    }

    if (code === 'SCORE_DISTRIBUTION') {
      const rows = await this.reviewRepository.find({ where: { companyId } });
      const grouped = new Map<string, { count: number; average: number }>();
      for (const row of rows.filter(
        (item) => item.finalScore !== null && visible(item.employeeId),
      )) {
        const key = row.ratingCode ?? 'UNRATED';
        const current = grouped.get(key) ?? { count: 0, average: 0 };
        current.count += 1;
        current.average += Number(row.finalScore ?? 0);
        grouped.set(key, current);
      }
      return Array.from(grouped.entries()).map(([rating_code, item]) => ({
        rating_code,
        review_count: item.count,
        average_score: Number((item.average / item.count).toFixed(2)),
      }));
    }

    if (code === 'PIP_STATUS') {
      const rows = await this.pipRepository.find({
        where: { companyId },
        relations: { milestones: true },
        order: { id: 'DESC' },
      });
      return rows
        .filter((row) => visible(row.employeeId))
        .map((row) => ({
          id: row.id,
          employee_id: row.employeeId,
          review_id: row.performanceReviewId,
          status: row.status,
          milestone_count: row.milestones?.length ?? 0,
          open_milestones:
            row.milestones?.filter(
              (item) =>
                item.status === PerformanceImprovementMilestoneStatusEnum.OPEN,
            ).length ?? 0,
          closed_at: row.closedAt?.toISOString() ?? null,
        }));
    }

    if (code === 'DEVELOPMENT_PLANS') {
      const rows = await this.developmentPlanRepository.find({
        where: { companyId },
        relations: { goals: true },
        order: { id: 'DESC', goals: { id: 'ASC' } },
      });
      return rows
        .filter((plan) => visible(plan.employeeId))
        .flatMap((plan) => {
          const goals: Array<PerformanceDevelopmentGoal | null> =
            plan.goals.length > 0 ? plan.goals : [null];
          return goals.map((goal) => ({
            plan_id: plan.id,
            employee_id: plan.employeeId,
            plan_status: plan.status,
            plan_title: plan.title,
            goal_id: goal?.id ?? null,
            goal_title: goal?.title ?? null,
            goal_status: goal?.status ?? null,
            progress_percent: goal?.progressPercent ?? null,
            target_date: goal?.targetDate ?? null,
            carried_from_goal_id: goal?.carryForwardFromGoalId ?? null,
          }));
        });
    }

    if (code === 'FEEDBACK_360') {
      const rows = await this.feedback360Repository.find({
        where: { companyId },
        order: { id: 'DESC' },
      });
      return rows
        .filter((row) => visible(row.subjectEmployeeId))
        .map((row) => ({
          id: row.id,
          review_id: row.performanceReviewId,
          subject_employee_id: row.subjectEmployeeId,
          rater_employee_id: row.isAnonymous ? null : row.raterEmployeeId,
          relationship_type: row.relationshipType,
          status: row.status,
          overall_score: row.overallScore,
          due_date: row.dueDate,
          submitted_at: row.submittedAt?.toISOString() ?? null,
        }));
    }

    throw new BadRequestException(
      `Unsupported performance report: ${reportCode}.`,
    );
  }

  private async scorecardRows(
    companyId: number,
    employeeIds?: number[],
  ): Promise<ReportRow[]> {
    if (employeeIds && !employeeIds.length) return [];
    const kpis = await this.employeeKpis.find({
      where: {
        companyId,
        ...(employeeIds ? { employeeId: In(employeeIds) } : {}),
      },
      order: { performancePeriodId: 'DESC', employeeId: 'ASC' },
    });
    const reviews = await this.cycleReviews.find({
      where: {
        companyId,
        ...(employeeIds ? { employeeId: In(employeeIds) } : {}),
      },
    });
    const scores = await this.cycleScores.find({
      where: {
        companyId,
        ...(employeeIds ? { employeeId: In(employeeIds) } : {}),
      },
    });
    return kpis.map((kpi) => {
      const mid = reviews.find(
        (review) => review.employeeKpiId === kpi.id && review.kind === 'MID',
      );
      const final = reviews.find(
        (review) => review.employeeKpiId === kpi.id && review.kind === 'FINAL',
      );
      const score = scores.find(
        (item) =>
          item.performancePeriodId === kpi.performancePeriodId &&
          item.employeeId === kpi.employeeId,
      );
      return {
        employee_id: kpi.employeeId,
        cycle_id: kpi.performancePeriodId,
        kpi_id: kpi.id,
        kpi: kpi.title,
        weight: kpi.weight,
        target: kpi.targetValue,
        actual: kpi.actualValue,
        assignment_status: kpi.status,
        mid_rating: mid?.managerRating ?? null,
        mid_score: mid?.weightedScore ?? null,
        final_rating: final?.managerRating ?? null,
        final_score: final?.weightedScore ?? null,
        cycle_score: score?.totalWeightedScore ?? null,
        cycle_rating: score?.finalRatingBand ?? null,
      };
    });
  }

  async export(
    actor: AuthenticatedUser,
    reportCode: string,
    format: PerformanceReportFormat,
  ) {
    const rows = await this.rows(actor, reportCode);
    if (format === 'json') {
      return Buffer.from(
        JSON.stringify({ report_code: reportCode, rows }, null, 2),
      );
    }
    if (format === 'csv') return this.toCsv(rows);
    if (format === 'xlsx') return this.toXlsx(reportCode, rows);
    if (format === 'pdf') return this.toPdf(reportCode, rows);
    throw new BadRequestException('Unsupported export format.');
  }

  private toCsv(rows: ReportRow[]) {
    const headers = this.headers(rows);
    const lines = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((header) => this.csvCell(row[header])).join(','),
      ),
    ];
    return Buffer.from(lines.join('\n'));
  }

  private async toXlsx(reportCode: string, rows: ReportRow[]) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(reportCode);
    const headers = this.headers(rows);
    sheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: 22,
    }));
    rows.forEach((row) => sheet.addRow(row));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private toPdf(reportCode: string, rows: ReportRow[]) {
    return new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 36, size: 'A4' });
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc
        .fontSize(16)
        .text(`Performance Report: ${reportCode}`, { underline: true });
      doc.moveDown();
      rows.slice(0, 200).forEach((row, index) => {
        doc.fontSize(10).text(`${index + 1}. ${JSON.stringify(row)}`);
        doc.moveDown(0.25);
      });
      if (rows.length > 200) {
        doc.moveDown().text(`Showing first 200 of ${rows.length} rows.`);
      }
      doc.end();
    });
  }

  private headers(rows: ReportRow[]) {
    return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  }

  private csvCell(value: ReportRow[string]) {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }
}
