import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { NotificationCategoryEnum } from '../../notifications/enums/notification-category.enum';
import { NotificationChannelEnum } from '../../notifications/enums/notification-channel.enum';
import { NotificationPriorityEnum } from '../../notifications/enums/notification-priority.enum';
import { NotificationTypeEnum } from '../../notifications/enums/notification-type.enum';
import {
  CreateNotificationInput,
  NotificationsService,
} from '../../notifications/notifications.service';
import { ActionItem } from '../action-inbox/entities/action-item.entity';
import { ActionItemStatusEnum } from '../action-inbox/enums/action-item-status.enum';
import { ActionItemTypeEnum } from '../action-inbox/enums/action-item-type.enum';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceDailyStatusEnum } from '../attendance/processing/enums/attendance-daily-status.enum';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeFinancePayrollInstruction } from '../employee-finance/entities/employee-finance-account.entities';
import { EmployeeFinancePayrollInstructionStatusEnum } from '../employee-finance/employee-finance.enums';
import { EmployeeKpi } from '../performance/entities/employee-kpi.entity';
import { PerformanceReview } from '../performance/entities/performance-review.entity';
import { EmployeeKpiStatusEnum } from '../performance/enums/employee-kpi-status.enum';
import { PerformanceReviewStatusEnum } from '../performance/enums/performance-review-status.enum';
import { PayrollRun, Payslip } from '../payroll/entities/payroll-run.entities';
import {
  PayrollOutputStatusEnum,
  PayrollRunStatusEnum,
} from '../payroll/payroll.enums';
import { DailyActivityReport } from '../work-activities/entities/daily-activity.entities';
import { FieldVisit } from '../work-activities/entities/field-visit.entities';
import {
  DailyActivityReportStatusEnum,
  FieldVisitStatusEnum,
} from '../work-activities/enums/work-activity.enums';
import { formatDateOnly } from '../shared/hr.utils';

@Injectable()
export class HrAlertSchedulerService {
  private readonly logger = new Logger(HrAlertSchedulerService.name);

  constructor(
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceSummaryRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(DailyActivityReport)
    private readonly dailyActivityReportRepository: Repository<DailyActivityReport>,
    @InjectRepository(FieldVisit)
    private readonly fieldVisitRepository: Repository<FieldVisit>,
    @InjectRepository(EmployeeKpi)
    private readonly employeeKpiRepository: Repository<EmployeeKpi>,
    @InjectRepository(PerformanceReview)
    private readonly performanceReviewRepository: Repository<PerformanceReview>,
    @InjectRepository(PayrollRun)
    private readonly payrollRunRepository: Repository<PayrollRun>,
    @InjectRepository(Payslip)
    private readonly payslipRepository: Repository<Payslip>,
    @InjectRepository(EmployeeFinancePayrollInstruction)
    private readonly financePayrollInstructionRepository: Repository<EmployeeFinancePayrollInstruction>,
    @InjectRepository(ActionItem)
    private readonly actionItemRepository: Repository<ActionItem>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyAlertScan(): Promise<void> {
    await this.runStep('attendance alerts', () => this.scanAttendanceIssues());
    await this.runStep('activity alerts', () =>
      this.scanDailyActivitySubmissions(),
    );
    await this.runStep('field visit alerts', () =>
      this.scanFieldVisitReportPending(),
    );
    await this.runStep('performance alerts', () =>
      this.scanPerformanceAlerts(),
    );
    await this.runStep('approval overdue alerts', () =>
      this.scanOverdueApprovals(),
    );
    await this.runStep('payroll alerts', () => this.scanPayrollAlerts());
    await this.runStep('employee finance alerts', () =>
      this.scanEmployeeFinanceAlerts(),
    );
  }

  private async scanAttendanceIssues(): Promise<void> {
    const attendanceDate = this.dateDaysAgo(1);
    const summaries = await this.attendanceSummaryRepository.find({
      where: {
        attendanceDate,
        attendanceStatus: In([
          AttendanceDailyStatusEnum.ABSENT,
          AttendanceDailyStatusEnum.LATE,
          AttendanceDailyStatusEnum.LATE_AND_EARLY_DEPARTURE,
        ]),
      },
      relations: { employee: true },
      take: 200,
    });

    const managerMap = await this.loadManagers(
      summaries.map((summary) => summary.employee).filter(Boolean),
    );

    for (const summary of summaries) {
      const employee = summary.employee;
      if (!employee?.company_user_id) continue;

      const isAbsent =
        summary.attendanceStatus === String(AttendanceDailyStatusEnum.ABSENT);
      const type = isAbsent
        ? NotificationTypeEnum.ATTENDANCE_MISSING
        : NotificationTypeEnum.ATTENDANCE_LATE;
      const title = isAbsent ? 'Attendance Missing' : 'Late Attendance';
      const message = isAbsent
        ? `No attendance punch was recorded for ${attendanceDate}.`
        : `Late attendance was recorded for ${attendanceDate}.`;

      await this.notify({
        company_id: summary.companyId,
        receiver_company_user_id: employee.company_user_id,
        type,
        category: NotificationCategoryEnum.HR,
        priority: isAbsent
          ? NotificationPriorityEnum.HIGH
          : NotificationPriorityEnum.MEDIUM,
        title,
        message,
        related_module: 'attendance',
        entity_type: 'ATTENDANCE_DAILY_SUMMARY',
        entity_id: summary.id,
        action_url: '/me/attendance',
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
        ],
        dedupe_key: `attendance:${summary.attendanceStatus}:employee:${summary.id}:${employee.company_user_id}`,
        metadata: {
          template_code: isAbsent ? 'attendance.missing' : 'attendance.late',
          attendance_date: attendanceDate,
          attendance_status: summary.attendanceStatus,
          late_minutes: summary.lateMinutes,
          employee_name: this.employeeName(employee),
        },
      });

      const manager = employee.reports_to
        ? managerMap.get(employee.reports_to)
        : null;
      if (!manager?.company_user_id) continue;

      await this.notify({
        company_id: summary.companyId,
        receiver_company_user_id: manager.company_user_id,
        type,
        category: NotificationCategoryEnum.HR,
        priority: isAbsent
          ? NotificationPriorityEnum.HIGH
          : NotificationPriorityEnum.MEDIUM,
        title,
        message: `${this.employeeName(employee)} has ${isAbsent ? 'missing' : 'late'} attendance for ${attendanceDate}.`,
        related_module: 'attendance',
        entity_type: 'ATTENDANCE_DAILY_SUMMARY',
        entity_id: summary.id,
        action_url: '/manager/attendance',
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
        ],
        dedupe_key: `attendance:${summary.attendanceStatus}:manager:${summary.id}:${manager.company_user_id}`,
        metadata: {
          template_code: isAbsent
            ? 'attendance.manager_missing'
            : 'attendance.manager_late',
          attendance_date: attendanceDate,
          attendance_status: summary.attendanceStatus,
          late_minutes: summary.lateMinutes,
          employee_name: this.employeeName(employee),
        },
      });
    }
  }

  private async scanDailyActivitySubmissions(): Promise<void> {
    const fromDate = this.dateDaysAgo(7);
    const toDate = this.dateDaysAgo(1);
    const reports = await this.dailyActivityReportRepository
      .createQueryBuilder('report')
      .where('report.activity_date BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      })
      .andWhere('report.status IN (:...statuses)', {
        statuses: [
          DailyActivityReportStatusEnum.DRAFT,
          DailyActivityReportStatusEnum.RETURNED_FOR_CORRECTION,
        ],
      })
      .orderBy('report.activity_date', 'DESC')
      .take(200)
      .getMany();

    const employees = await this.loadEmployees(
      reports.map((report) => report.employeeId),
    );

    for (const report of reports) {
      const employee = employees.get(report.employeeId);
      if (employee?.company_user_id) {
        await this.notify({
          company_id: report.companyId,
          receiver_company_user_id: employee.company_user_id,
          type: NotificationTypeEnum.DAILY_ACTIVITY_NOT_SUBMITTED,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.HIGH,
          title: 'Daily Activity Not Submitted',
          message: `Your daily activity report for ${report.activityDate} is not submitted.`,
          related_module: 'work-activities',
          entity_type: 'DAILY_ACTIVITY_REPORT',
          entity_id: report.id,
          action_url: '/me/daily-activities',
          channels: [
            NotificationChannelEnum.IN_APP,
            NotificationChannelEnum.EMAIL,
          ],
          dedupe_key: `daily-activity:not-submitted:employee:${report.id}:${employee.company_user_id}`,
          metadata: {
            template_code: 'daily_activity.not_submitted',
            activity_date: report.activityDate,
            employee_name: this.employeeName(employee),
          },
        });
      }

      if (!report.managerCompanyUserId) continue;
      await this.notify({
        company_id: report.companyId,
        receiver_company_user_id: report.managerCompanyUserId,
        type: NotificationTypeEnum.DAILY_ACTIVITY_NOT_SUBMITTED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Daily Activity Pending',
        message: `${this.employeeName(employee)} has not submitted the daily activity report for ${report.activityDate}.`,
        related_module: 'work-activities',
        entity_type: 'DAILY_ACTIVITY_REPORT',
        entity_id: report.id,
        action_url: '/manager/daily-activities',
        channels: [NotificationChannelEnum.IN_APP],
        dedupe_key: `daily-activity:not-submitted:manager:${report.id}:${report.managerCompanyUserId}`,
        metadata: {
          template_code: 'daily_activity.manager_not_submitted',
          activity_date: report.activityDate,
          employee_name: this.employeeName(employee),
        },
      });
    }
  }

  private async scanFieldVisitReportPending(): Promise<void> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 1);

    const visits = await this.fieldVisitRepository
      .createQueryBuilder('visit')
      .where('visit.check_out_at IS NOT NULL')
      .andWhere('visit.check_out_at <= :cutoff', { cutoff })
      .andWhere("(visit.outcome IS NULL OR BTRIM(visit.outcome) = '')")
      .andWhere('visit.status NOT IN (:...excludedStatuses)', {
        excludedStatuses: [
          FieldVisitStatusEnum.CANCELLED,
          FieldVisitStatusEnum.REJECTED,
        ],
      })
      .andWhere('visit.visit_date >= :windowStart', {
        windowStart: this.dateDaysAgo(14),
      })
      .orderBy('visit.check_out_at', 'DESC')
      .take(200)
      .getMany();

    const employees = await this.loadEmployees(
      visits.map((visit) => visit.employeeId),
    );

    for (const visit of visits) {
      const employee = employees.get(visit.employeeId);
      if (employee?.company_user_id) {
        await this.notify({
          company_id: visit.companyId,
          receiver_company_user_id: employee.company_user_id,
          type: NotificationTypeEnum.FIELD_VISIT_REPORT_PENDING,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.HIGH,
          title: 'Field Visit Report Pending',
          message: `Submit the outcome for field visit ${visit.visitNo}.`,
          related_module: 'field-visits',
          entity_type: 'FIELD_VISIT',
          entity_id: visit.id,
          action_url: '/me/field-visits',
          channels: [
            NotificationChannelEnum.IN_APP,
            NotificationChannelEnum.EMAIL,
          ],
          dedupe_key: `field-visit:report-pending:employee:${visit.id}:${employee.company_user_id}`,
          metadata: {
            template_code: 'field_visit.report_pending',
            visit_no: visit.visitNo,
            visit_date: visit.visitDate,
            employee_name: this.employeeName(employee),
          },
        });
      }

      if (!visit.managerCompanyUserId) continue;
      await this.notify({
        company_id: visit.companyId,
        receiver_company_user_id: visit.managerCompanyUserId,
        type: NotificationTypeEnum.FIELD_VISIT_REPORT_PENDING,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Field Visit Outcome Pending',
        message: `${this.employeeName(employee)} has a field visit outcome pending for ${visit.visitNo}.`,
        related_module: 'field-visits',
        entity_type: 'FIELD_VISIT',
        entity_id: visit.id,
        action_url: '/manager/field-visits',
        channels: [NotificationChannelEnum.IN_APP],
        dedupe_key: `field-visit:report-pending:manager:${visit.id}:${visit.managerCompanyUserId}`,
        metadata: {
          template_code: 'field_visit.manager_report_pending',
          visit_no: visit.visitNo,
          visit_date: visit.visitDate,
          employee_name: this.employeeName(employee),
        },
      });
    }
  }

  private async scanPerformanceAlerts(): Promise<void> {
    await this.scanKpiUpdatesPending();
    await this.scanPublishedPerformanceReviews();
  }

  private async scanKpiUpdatesPending(): Promise<void> {
    const kpis = await this.employeeKpiRepository
      .createQueryBuilder('kpi')
      .where('kpi.due_date BETWEEN :fromDate AND :toDate', {
        fromDate: this.dateDaysAgo(14),
        toDate: formatDateOnly(new Date()),
      })
      .andWhere('kpi.status IN (:...statuses)', {
        statuses: [EmployeeKpiStatusEnum.DRAFT, EmployeeKpiStatusEnum.RETURNED],
      })
      .orderBy('kpi.due_date', 'ASC')
      .take(200)
      .getMany();

    const employees = await this.loadEmployees(
      kpis.map((kpi) => kpi.employeeId),
    );

    for (const kpi of kpis) {
      const employee = employees.get(kpi.employeeId);
      if (!employee?.company_user_id) continue;

      await this.notify({
        company_id: kpi.companyId,
        receiver_company_user_id: employee.company_user_id,
        type: NotificationTypeEnum.KPI_UPDATE_PENDING,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.HIGH,
        title: 'KPI Update Pending',
        message: `Update KPI "${kpi.title}" before completing your review.`,
        related_module: 'performance',
        entity_type: 'EMPLOYEE_KPI',
        entity_id: kpi.id,
        action_url: '/me/performance/kpis',
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
        ],
        dedupe_key: `performance:kpi-update-pending:${kpi.id}:${employee.company_user_id}:${kpi.dueDate}`,
        metadata: {
          template_code: 'performance.kpi_update_pending',
          kpi_title: kpi.title,
          due_date: kpi.dueDate,
          employee_name: this.employeeName(employee),
        },
      });
    }
  }

  private async scanPublishedPerformanceReviews(): Promise<void> {
    const reviews = await this.performanceReviewRepository
      .createQueryBuilder('review')
      .where('review.status = :status', {
        status: PerformanceReviewStatusEnum.PUBLISHED,
      })
      .andWhere('review.published_at >= :since', { since: this.sinceDays(14) })
      .orderBy('review.published_at', 'DESC')
      .take(200)
      .getMany();

    const employees = await this.loadEmployees(
      reviews.map((review) => review.employeeId),
    );

    for (const review of reviews) {
      const employee = employees.get(review.employeeId);
      if (!employee?.company_user_id) continue;

      await this.notify({
        company_id: review.companyId,
        receiver_company_user_id: employee.company_user_id,
        type: NotificationTypeEnum.KPI_SCORE_PUBLISHED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Performance Score Published',
        message: 'Your performance score has been published.',
        related_module: 'performance',
        entity_type: 'PERFORMANCE_REVIEW',
        entity_id: review.id,
        action_url: '/me/performance/reviews',
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
        ],
        dedupe_key: `performance:score-published:${review.id}:${employee.company_user_id}`,
        metadata: {
          template_code: 'performance.score_published',
          final_score: review.finalScore,
          rating_code: review.ratingCode,
          published_at: review.publishedAt,
          employee_name: this.employeeName(employee),
        },
      });
    }
  }

  private async scanPayrollAlerts(): Promise<void> {
    await this.scanProcessedPayrollRuns();
    await this.scanPublishedPayslips();
  }

  private async scanOverdueApprovals(): Promise<void> {
    const today = formatDateOnly(new Date());
    const actionItems = await this.actionItemRepository
      .createQueryBuilder('item')
      .where('item.action_type = :actionType', {
        actionType: ActionItemTypeEnum.APPROVAL,
      })
      .andWhere('item.status IN (:...statuses)', {
        statuses: [ActionItemStatusEnum.OPEN, ActionItemStatusEnum.IN_PROGRESS],
      })
      .andWhere('item.due_at IS NOT NULL')
      .andWhere('item.due_at <= :now', { now: new Date() })
      .orderBy('item.due_at', 'ASC')
      .take(200)
      .getMany();

    for (const item of actionItems) {
      await this.notify({
        company_id: item.companyId,
        receiver_company_user_id: item.assigneeCompanyUserId,
        type: NotificationTypeEnum.APPROVAL_OVERDUE,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.HIGH,
        title: 'Approval Overdue',
        message: item.description ?? `${item.title} is overdue.`,
        related_module: item.sourceModule,
        entity_type: item.sourceEntityType,
        entity_id: item.sourceEntityId,
        branch_id: item.branchId,
        department_id: item.departmentId,
        action_url: item.actionUrl,
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
        ],
        dedupe_key: `approval:overdue:${item.id}:${item.assigneeCompanyUserId}:${today}`,
        metadata: {
          template_code: 'approval.overdue',
          action_item_id: item.id,
          action_item_title: item.title,
          source_key: item.sourceKey,
          due_at: item.dueAt,
          source_module: item.sourceModule,
        },
      });
    }
  }

  private async scanProcessedPayrollRuns(): Promise<void> {
    const runs = await this.payrollRunRepository
      .createQueryBuilder('run')
      .where('run.status IN (:...statuses)', {
        statuses: [
          PayrollRunStatusEnum.CALCULATED,
          PayrollRunStatusEnum.PENDING_HR_APPROVAL,
          PayrollRunStatusEnum.PENDING_FINANCE_APPROVAL,
          PayrollRunStatusEnum.PENDING_MANAGEMENT_APPROVAL,
          PayrollRunStatusEnum.APPROVED,
          PayrollRunStatusEnum.LOCKED,
          PayrollRunStatusEnum.PAID,
        ],
      })
      .andWhere(
        '(run.calculated_at >= :since OR run.approved_at >= :since OR run.locked_at >= :since)',
        { since: this.sinceDays(14) },
      )
      .orderBy('run.id', 'DESC')
      .take(100)
      .getMany();

    for (const run of runs) {
      await this.notify({
        company_id: run.companyId,
        receiver_company_user_id: run.createdByCompanyUserId,
        type: NotificationTypeEnum.PAYROLL_PROCESSED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.HIGH,
        title: 'Payroll Processed',
        message: `Payroll run ${run.runNo} is ${run.status.toLowerCase().replace(/_/g, ' ')}.`,
        related_module: 'payroll',
        entity_type: 'PAYROLL_RUN',
        entity_id: run.id,
        action_url: `/payroll/runs/${run.id}`,
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
        ],
        dedupe_key: `payroll:processed:${run.id}:${run.status}:${run.createdByCompanyUserId}`,
        metadata: {
          template_code: 'payroll.processed',
          payroll_run_no: run.runNo,
          payroll_status: run.status,
          employee_count: run.employeeCount,
        },
      });
    }
  }

  private async scanPublishedPayslips(): Promise<void> {
    const payslips = await this.payslipRepository
      .createQueryBuilder('payslip')
      .where('payslip.status = :status', {
        status: PayrollOutputStatusEnum.PUBLISHED,
      })
      .andWhere('payslip.published_at >= :since', { since: this.sinceDays(14) })
      .orderBy('payslip.published_at', 'DESC')
      .take(200)
      .getMany();

    const employees = await this.loadEmployees(
      payslips.map((payslip) => payslip.employeeId),
    );

    for (const payslip of payslips) {
      const employee = employees.get(payslip.employeeId);
      if (!employee?.company_user_id) continue;

      await this.notify({
        company_id: payslip.companyId,
        receiver_company_user_id: employee.company_user_id,
        type: NotificationTypeEnum.PAYSLIP_AVAILABLE,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Payslip Available',
        message: 'Your payslip is available.',
        related_module: 'payroll',
        entity_type: 'PAYSLIP',
        entity_id: payslip.id,
        action_url: '/me/payslips',
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
        ],
        dedupe_key: `payroll:payslip-available:${payslip.id}:${employee.company_user_id}`,
        metadata: {
          template_code: 'payroll.payslip_available',
          payslip_no: payslip.payslipNo,
          published_at: payslip.publishedAt,
          employee_name: this.employeeName(employee),
        },
      });
    }
  }

  private async scanEmployeeFinanceAlerts(): Promise<void> {
    const instructions = await this.financePayrollInstructionRepository.find({
      where: {
        status: EmployeeFinancePayrollInstructionStatusEnum.POSTED,
      },
      order: { id: 'DESC' },
      take: 200,
    });
    const employeeIds = instructions.map(
      (instruction) => instruction.employeeId,
    );
    const employees = await this.loadEmployees(employeeIds);
    const payrollRunIds = [
      ...new Set(
        instructions
          .map((instruction) => instruction.payrollRunId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    ];
    const payrollRuns = payrollRunIds.length
      ? await this.payrollRunRepository.findBy({ id: In(payrollRunIds) })
      : [];
    const runMap = new Map(payrollRuns.map((run) => [run.id, run]));

    for (const instruction of instructions) {
      const employee = employees.get(instruction.employeeId);
      if (!employee?.company_user_id) continue;

      const run = instruction.payrollRunId
        ? runMap.get(instruction.payrollRunId)
        : null;
      await this.notify({
        company_id: instruction.companyId,
        receiver_company_user_id: employee.company_user_id,
        type: NotificationTypeEnum.STAFF_LOAN_INSTALLMENT_DEDUCTED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Finance Installment Posted',
        message: 'An employee finance installment was posted to payroll.',
        related_module: 'employee-finance',
        entity_type: 'EMPLOYEE_FINANCE_PAYROLL_INSTRUCTION',
        entity_id: instruction.id,
        action_url: '/me/employee-finance',
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
        ],
        dedupe_key: `employee-finance:installment-posted:${instruction.id}:${employee.company_user_id}`,
        metadata: {
          template_code: 'employee_finance.installment_posted',
          payroll_run_no: run?.runNo ?? null,
          component_code: instruction.componentCode,
          amount: instruction.postedAmount || instruction.amount,
          employee_name: this.employeeName(employee),
        },
      });
    }
  }

  private async loadEmployees(employeeIds: Array<number | null | undefined>) {
    const ids = [...new Set(employeeIds.filter((id) => this.isNumber(id)))];
    if (!ids.length) return new Map<number, Employee>();

    const employees = await this.employeeRepository.findBy({ id: In(ids) });
    return new Map(employees.map((employee) => [employee.id, employee]));
  }

  private async loadManagers(employees: Employee[]) {
    return this.loadEmployees(employees.map((employee) => employee.reports_to));
  }

  private async notify(input: CreateNotificationInput): Promise<void> {
    try {
      await this.notificationsService.createAndPush(input);
    } catch (error) {
      this.logger.error(
        `Failed to send HR alert ${input.dedupe_key ?? input.type}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async runStep(
    label: string,
    handler: () => Promise<void>,
  ): Promise<void> {
    try {
      await handler();
    } catch (error) {
      this.logger.error(
        `Failed to scan ${label}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private employeeName(employee?: Employee | null): string {
    if (!employee) return 'Employee';
    return (
      [employee.first_name, employee.middle_name, employee.last_name]
        .filter(Boolean)
        .join(' ') || employee.employee_no
    );
  }

  private dateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return formatDateOnly(date);
  }

  private sinceDays(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  private isNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }
}
