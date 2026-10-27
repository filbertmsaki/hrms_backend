import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActionItemTypeEnum } from '../../action-inbox/enums/action-item-type.enum';
import { ActionItemsService } from '../../action-inbox/action-items.service';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { Department } from '../../departments/entities/department.entity';
import { DailyActivityReport } from '../entities/daily-activity.entities';
import { FieldFollowUp, FieldVisit } from '../entities/field-visit.entities';
import { ActivityPolicyService } from './activity-policy.service';
import { WorkActivityEligibilityService } from './work-activity-eligibility.service';
import {
  DailyActivityReportStatusEnum,
  FieldFollowUpStatusEnum,
  FieldVisitStatusEnum,
} from '../enums/work-activity.enums';

@Injectable()
export class WorkActivityReminderService {
  constructor(
    private readonly configService: ConfigService,
    private readonly actionItemsService: ActionItemsService,
    private readonly activityPolicyService: ActivityPolicyService,
    private readonly eligibilityService: WorkActivityEligibilityService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(DailyActivityReport)
    private readonly reportRepository: Repository<DailyActivityReport>,
    @InjectRepository(FieldVisit)
    private readonly visitRepository: Repository<FieldVisit>,
    @InjectRepository(FieldFollowUp)
    private readonly followUpRepository: Repository<FieldFollowUp>,
  ) {}

  private localDateTime(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? '';
    return {
      date: `${value('year')}-${value('month')}-${value('day')}`,
      time: `${value('hour')}:${value('minute')}`,
    };
  }

  private isSubmittedReportStatus(status: DailyActivityReportStatusEnum) {
    return new Set<DailyActivityReportStatusEnum>([
      DailyActivityReportStatusEnum.SUBMITTED,
      DailyActivityReportStatusEnum.MANAGER_REVIEW_PENDING,
      DailyActivityReportStatusEnum.RETURNED_FOR_CORRECTION,
      DailyActivityReportStatusEnum.APPROVED,
      DailyActivityReportStatusEnum.LOCKED,
    ]).has(status);
  }

  private async cancelMissingSubmissionActions(
    companyId: number,
    employeeId: number,
    activityDate: string,
  ) {
    await Promise.all([
      this.actionItemsService.cancelBySource(
        companyId,
        `daily-activity:missing:${employeeId}:${activityDate}`,
      ),
      this.actionItemsService.cancelBySource(
        companyId,
        `daily-activity:missing-escalation:manager:${employeeId}:${activityDate}`,
      ),
      this.actionItemsService.cancelBySource(
        companyId,
        `daily-activity:missing-escalation:department-head:${employeeId}:${activityDate}`,
      ),
    ]);
  }

  private async cancelMissingSubmissionEscalations(
    companyId: number,
    employeeId: number,
    activityDate: string,
  ) {
    await Promise.all([
      this.actionItemsService.cancelBySource(
        companyId,
        `daily-activity:missing-escalation:manager:${employeeId}:${activityDate}`,
      ),
      this.actionItemsService.cancelBySource(
        companyId,
        `daily-activity:missing-escalation:department-head:${employeeId}:${activityDate}`,
      ),
    ]);
  }

  private missingSubmissionEscalationsEnabled() {
    return false;
  }

  private previousDate(date: string) {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() - 1);
    return value.toISOString().slice(0, 10);
  }

  private localDateTimeToUtc(date: string, time: string, timeZone: string) {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    const desired = Date.UTC(year, month - 1, day, hour, minute);
    let instant = desired;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const local = this.localDateTime(new Date(instant), timeZone);
      const [localYear, localMonth, localDay] = local.date
        .split('-')
        .map(Number);
      const [localHour, localMinute] = local.time.split(':').map(Number);
      const represented = Date.UTC(
        localYear,
        localMonth - 1,
        localDay,
        localHour,
        localMinute,
      );
      instant += desired - represented;
    }
    return new Date(instant);
  }

  private async findMissingSubmissionTarget(employee: Employee, now: Date) {
    const initialPolicy = await this.activityPolicyService.resolveForEmployee(
      employee.company_id,
      employee,
      now.toISOString().slice(0, 10),
    );
    const initialTimezone =
      (initialPolicy as { submissionTimezone?: string }).submissionTimezone ??
      'UTC';
    const provisionalDate = this.localDateTime(now, initialTimezone).date;
    const policy = await this.activityPolicyService.resolveForEmployee(
      employee.company_id,
      employee,
      provisionalDate,
    );
    const values = policy as {
      dailySubmissionRequired?: boolean;
      submissionTimezone?: string;
      submissionCutoffTime?: string;
    };
    const timezone = values.submissionTimezone || 'UTC';
    const localNow = this.localDateTime(now, timezone);
    const cutoff = values.submissionCutoffTime || '20:00';
    let targetDate =
      localNow.time >= cutoff
        ? localNow.date
        : this.previousDate(localNow.date);
    const targetPolicy = await this.activityPolicyService.resolveForEmployee(
      employee.company_id,
      employee,
      targetDate,
    );
    const targetValues = targetPolicy as {
      dailySubmissionRequired?: boolean;
      submissionTimezone?: string;
      submissionCutoffTime?: string;
    };
    const targetTimezone = targetValues.submissionTimezone || timezone;
    const targetLocalNow = this.localDateTime(now, targetTimezone);
    const targetCutoff = targetValues.submissionCutoffTime || cutoff;
    targetDate =
      targetLocalNow.time >= targetCutoff
        ? targetLocalNow.date
        : this.previousDate(targetLocalNow.date);
    return {
      policy: targetPolicy,
      timezone: targetTimezone,
      cutoff: targetCutoff,
      targetDate,
      pastCutoff: targetLocalNow.time >= targetCutoff,
      dailySubmissionRequired: targetValues.dailySubmissionRequired !== false,
    };
  }

  @Cron(process.env.ACTIVITY_REMINDER_CRON || '0 */15 * * * *')
  async sendSubmissionReminders(companyId?: number) {
    const now = new Date();
    const activeEmployees = await this.employeeRepository.find({
      where: {
        employment_status: EmploymentStatusEnum.ACTIVE,
        ...(companyId ? { company_id: companyId } : {}),
      },
      select: [
        'id',
        'company_id',
        'company_user_id',
        'employee_no',
        'first_name',
        'middle_name',
        'last_name',
        'primary_branch_id',
        'primary_department_id',
        'primary_position_id',
        'grade_id',
        'employment_type',
        'employment_status',
        'hire_date',
        'exit_date',
      ],
    });

    let created = 0;

    for (const employee of activeEmployees) {
      if (employee.company_user_id === null) {
        continue;
      }
      const pending = await this.findMissingSubmissionTarget(employee, now);
      if (!pending.dailySubmissionRequired) {
        await this.cancelMissingSubmissionActions(
          employee.company_id,
          employee.id,
          pending.targetDate,
        );
        continue;
      }
      // The job runs every 15 minutes so each employee is evaluated shortly after their
      // own policy cutoff, regardless of the server's timezone.
      const targetDate = pending.targetDate;
      const eligibility = await this.eligibilityService.evaluate(
        employee,
        targetDate,
        pending.timezone,
      );
      if (!eligibility.eligible) {
        await this.cancelMissingSubmissionActions(
          employee.company_id,
          employee.id,
          targetDate,
        );
        continue;
      }
      if (!pending.pastCutoff) {
        const priorReport = await this.reportRepository.findOne({
          where: {
            companyId: employee.company_id,
            employeeId: employee.id,
            activityDate: targetDate,
          },
        });
        if (priorReport && this.isSubmittedReportStatus(priorReport.status)) {
          await this.cancelMissingSubmissionActions(
            employee.company_id,
            employee.id,
            targetDate,
          );
        }
        continue;
      }
      const report = await this.reportRepository.findOne({
        where: {
          companyId: employee.company_id,
          employeeId: employee.id,
          activityDate: targetDate,
        },
      });

      if (report && this.isSubmittedReportStatus(report.status)) {
        await this.cancelMissingSubmissionActions(
          employee.company_id,
          employee.id,
          targetDate,
        );
        continue;
      }

      const reportBeforeReminder = await this.reportRepository.findOne({
        where: {
          companyId: employee.company_id,
          employeeId: employee.id,
          activityDate: targetDate,
        },
      });
      if (
        reportBeforeReminder &&
        this.isSubmittedReportStatus(reportBeforeReminder.status)
      ) {
        await this.cancelMissingSubmissionActions(
          employee.company_id,
          employee.id,
          targetDate,
        );
        continue;
      }

      await this.actionItemsService.upsertOpen(
        {
          companyId: employee.company_id,
          assigneeCompanyUserId: employee.company_user_id,
          assigneeEmployeeId: employee.id,
          actionType: ActionItemTypeEnum.REMINDER,
          sourceModule: 'WORK_ACTIVITIES',
          sourceEntityType: 'DAILY_ACTIVITY_REPORT',
          sourceEntityId: `${employee.id}:${targetDate}`,
          sourceKey: `daily-activity:missing:${employee.id}:${targetDate}`,
          title: 'Submit daily activity report',
          description: `Daily activity report for ${targetDate} is still missing.`,
          actionUrl: '/me/activities',
          branchId: employee.primary_branch_id,
          departmentId: employee.primary_department_id,
          metadata: {
            activityDate: targetDate,
            isWorkday: eligibility.isWorkday,
            isOffDay: eligibility.isOffDay,
            isHoliday: eligibility.isHoliday,
            hasApprovedLeave: eligibility.hasApprovedLeave,
            scheduleSource: eligibility.scheduleSource,
            timezone: eligibility.timezone,
          },
        },
        { reopenCompleted: false },
      );
      created += 1;
    }

    return created;
  }

  @Cron(process.env.ACTIVITY_ESCALATION_CRON || '0 30 21 * * *')
  async sendReviewAndFollowUpReminders(companyId?: number) {
    await this.actionItemsService.cancelBySourcePrefix(
      'daily-activity:missing-escalation:',
      companyId,
    );
    const fallbackManagerReviewDueHours = this.configService.get<number>(
      'ACTIVITY_MANAGER_REVIEW_DUE_HOURS',
      24,
    );
    const overdueCutoff = new Date(
      Date.now() - fallbackManagerReviewDueHours * 3600000,
    );

    const pendingReports = await this.reportRepository.find({
      where: {
        status: DailyActivityReportStatusEnum.MANAGER_REVIEW_PENDING,
        ...(companyId ? { companyId } : {}),
      },
      take: 100,
      order: { submittedAt: 'ASC', id: 'ASC' },
    });
    const pendingVisits = await this.visitRepository.find({
      where: {
        status: FieldVisitStatusEnum.MANAGER_REVIEW_PENDING,
        ...(companyId ? { companyId } : {}),
      },
      take: 100,
      order: { checkOutAt: 'ASC', id: 'ASC' },
    });
    const overdueFollowUps = await this.followUpRepository.find({
      where: {
        status: FieldFollowUpStatusEnum.OPEN,
        ...(companyId ? { companyId } : {}),
      },
      take: 100,
      order: { dueDate: 'ASC', id: 'ASC' },
    });

    let created = 0;

    for (const report of pendingReports) {
      if (!report.submittedAt) {
        continue;
      }
      const employee = await this.employeeRepository.findOne({
        where: { id: report.employeeId, company_id: report.companyId },
      });
      if (!employee) continue;
      const policy = await this.activityPolicyService.resolveForEmployee(
        report.companyId,
        employee,
        report.activityDate,
      );
      const managerDueHours = Number(
        (
          policy as {
            manager_review_due_hours?: number;
            managerReviewDueHours?: number;
          }
        ).manager_review_due_hours ??
          (policy as { managerReviewDueHours?: number })
            .managerReviewDueHours ??
          fallbackManagerReviewDueHours,
      );
      const managerDueAt = new Date(
        report.submittedAt.getTime() + managerDueHours * 3600000,
      );

      if (report.managerCompanyUserId && managerDueAt <= new Date()) {
        await this.actionItemsService.upsertOpen(
          {
            companyId: report.companyId,
            assigneeCompanyUserId: report.managerCompanyUserId,
            assigneeEmployeeId: report.managerEmployeeId ?? null,
            actionType: ActionItemTypeEnum.REMINDER,
            sourceModule: 'WORK_ACTIVITIES',
            sourceEntityType: 'DAILY_ACTIVITY_REPORT',
            sourceEntityId: report.id,
            sourceKey: `daily-activity:overdue-review:${report.id}`,
            title: 'Overdue daily activity review',
            description: `Daily activity report for ${report.activityDate} is awaiting your review.`,
            actionUrl: `/manager/activities/reports/${report.id}`,
            dueAt: managerDueAt,
          },
          { reopenCompleted: false },
        );
        created += 1;
      }

      const policyValues = policy as {
        department_head_escalation_enabled?: boolean;
        departmentHeadEscalationEnabled?: boolean;
        department_head_escalation_hours?: number;
        departmentHeadEscalationHours?: number;
      };
      const escalationEnabled =
        policyValues.department_head_escalation_enabled ??
        policyValues.departmentHeadEscalationEnabled ??
        false;
      const escalationHours = Number(
        policyValues.department_head_escalation_hours ??
          policyValues.departmentHeadEscalationHours ??
          48,
      );
      const escalationDueAt = new Date(
        report.submittedAt.getTime() + escalationHours * 3600000,
      );
      if (
        !escalationEnabled ||
        escalationDueAt > new Date() ||
        !employee.primary_department_id
      )
        continue;

      const department = await this.departmentRepository.findOne({
        where: {
          id: employee.primary_department_id,
          company_id: report.companyId,
          status: 'active',
        },
      });
      if (
        !department?.manager_employee_id ||
        department.manager_employee_id === employee.id
      )
        continue;
      const departmentHead = await this.employeeRepository.findOne({
        where: {
          id: department.manager_employee_id,
          company_id: report.companyId,
          employment_status: EmploymentStatusEnum.ACTIVE,
        },
      });
      if (
        !departmentHead?.company_user_id ||
        departmentHead.id === report.managerEmployeeId
      )
        continue;
      await this.actionItemsService.upsertOpen(
        {
          companyId: report.companyId,
          assigneeCompanyUserId: departmentHead.company_user_id,
          assigneeEmployeeId: departmentHead.id,
          actionType: ActionItemTypeEnum.REMINDER,
          sourceModule: 'WORK_ACTIVITIES',
          sourceEntityType: 'DAILY_ACTIVITY_REPORT',
          sourceEntityId: report.id,
          sourceKey: `daily-activity:department-head-escalation:${report.id}`,
          title: 'Daily activity review escalation',
          description: `Daily activity report for ${report.activityDate} remains unreviewed after ${escalationHours} hours.`,
          actionUrl: `/manager/activities/reports/${report.id}`,
          dueAt: escalationDueAt,
          departmentId: employee.primary_department_id,
          metadata: {
            escalationLevel: 'DEPARTMENT_HEAD',
            managerEmployeeId: report.managerEmployeeId,
          },
        },
        { reopenCompleted: false },
      );
      created += 1;
    }

    // Missing rows and drafts are also pending submissions. Route these using
    // the same policy cutoff and escalation intervals as submitted work.
    const employees = await this.employeeRepository.find({
      where: { employment_status: EmploymentStatusEnum.ACTIVE },
      select: [
        'id',
        'company_id',
        'company_user_id',
        'employee_no',
        'first_name',
        'last_name',
        'primary_branch_id',
        'primary_department_id',
        'primary_position_id',
        'grade_id',
        'employment_type',
        'employment_status',
        'hire_date',
        'exit_date',
        'reports_to',
      ],
    });
    for (const employee of employees) {
      const pending = await this.findMissingSubmissionTarget(
        employee,
        new Date(),
      );
      const latestOverdueDate = pending.pastCutoff
        ? this.previousDate(pending.targetDate)
        : pending.targetDate;
      const targetDates = [
        latestOverdueDate,
        this.previousDate(latestOverdueDate),
        this.previousDate(this.previousDate(latestOverdueDate)),
      ];
      for (const targetDate of targetDates) {
        if (!this.missingSubmissionEscalationsEnabled()) {
          await this.cancelMissingSubmissionEscalations(
            employee.company_id,
            employee.id,
            targetDate,
          );
          continue;
        }
        const policy = await this.activityPolicyService.resolveForEmployee(
          employee.company_id,
          employee,
          targetDate,
        );
        const policyValues = policy as {
          dailySubmissionRequired?: boolean;
          submissionTimezone?: string;
          submissionCutoffTime?: string;
          manager_review_due_hours?: number;
          managerReviewDueHours?: number;
          department_head_escalation_enabled?: boolean;
          departmentHeadEscalationEnabled?: boolean;
          department_head_escalation_hours?: number;
          departmentHeadEscalationHours?: number;
        };
        if (policyValues.dailySubmissionRequired === false) continue;
        const targetTimezone =
          policyValues.submissionTimezone || pending.timezone;
        const eligibility = await this.eligibilityService.evaluate(
          employee,
          targetDate,
          targetTimezone,
        );
        if (!eligibility.eligible) continue;
        const report = await this.reportRepository.findOne({
          where: {
            companyId: employee.company_id,
            employeeId: employee.id,
            activityDate: targetDate,
          },
        });
        if (report && this.isSubmittedReportStatus(report.status)) {
          await this.cancelMissingSubmissionActions(
            employee.company_id,
            employee.id,
            targetDate,
          );
          continue;
        }
        const managerHours = Number(
          policyValues.manager_review_due_hours ??
            policyValues.managerReviewDueHours ??
            fallbackManagerReviewDueHours,
        );
        const cutoffAt = this.localDateTimeToUtc(
          targetDate,
          policyValues.submissionCutoffTime || pending.cutoff,
          targetTimezone,
        );
        const managerDueAt = new Date(
          cutoffAt.getTime() + managerHours * 3600000,
        );
        let managerEmployee = employee.reports_to
          ? await this.employeeRepository.findOne({
              where: {
                id: employee.reports_to,
                company_id: employee.company_id,
                employment_status: EmploymentStatusEnum.ACTIVE,
              },
              select: ['id', 'company_id', 'company_user_id'],
            })
          : null;
        let managerUserId = managerEmployee?.company_user_id ?? null;

        if (!managerUserId && employee.primary_department_id) {
          const department = await this.departmentRepository.findOne({
            where: {
              id: employee.primary_department_id,
              company_id: employee.company_id,
              status: 'active',
            },
          });
          if (department?.manager_employee_id) {
            managerEmployee = await this.employeeRepository.findOne({
              where: {
                id: department.manager_employee_id,
                company_id: employee.company_id,
                employment_status: EmploymentStatusEnum.ACTIVE,
              },
              select: ['id', 'company_id', 'company_user_id'],
            });
            managerUserId = managerEmployee?.company_user_id ?? null;
          }
        }

        if (managerUserId && managerEmployee && managerDueAt <= new Date()) {
          const reportBeforeManagerEscalation =
            await this.reportRepository.findOne({
              where: {
                companyId: employee.company_id,
                employeeId: employee.id,
                activityDate: targetDate,
              },
            });
          if (
            reportBeforeManagerEscalation &&
            this.isSubmittedReportStatus(reportBeforeManagerEscalation.status)
          ) {
            await this.cancelMissingSubmissionActions(
              employee.company_id,
              employee.id,
              targetDate,
            );
            continue;
          }
          await this.actionItemsService.upsertOpen(
            {
              companyId: employee.company_id,
              assigneeCompanyUserId: managerUserId,
              assigneeEmployeeId: managerEmployee.id,
              actionType: ActionItemTypeEnum.REMINDER,
              sourceModule: 'WORK_ACTIVITIES',
              sourceEntityType: 'DAILY_ACTIVITY_REPORT',
              sourceEntityId: `${employee.id}:${targetDate}`,
              sourceKey: `daily-activity:missing-escalation:manager:${employee.id}:${targetDate}`,
              title: 'Missing daily activity report',
              description: `Daily activity report for ${targetDate} has not been submitted.`,
              actionUrl: `/manager/activities/reports?employeeId=${employee.id}&date=${targetDate}`,
              dueAt: managerDueAt,
              branchId: employee.primary_branch_id,
              departmentId: employee.primary_department_id,
              metadata: {
                escalationLevel: 'REPORTING_MANAGER',
                employeeId: employee.id,
                activityDate: targetDate,
                timezone: targetTimezone,
                isWorkday: eligibility.isWorkday,
                isOffDay: eligibility.isOffDay,
                isHoliday: eligibility.isHoliday,
                hasApprovedLeave: eligibility.hasApprovedLeave,
              },
            },
            { reopenCompleted: false },
          );
          created += 1;
        }

        const departmentEscalationEnabled =
          policyValues.department_head_escalation_enabled ??
          policyValues.departmentHeadEscalationEnabled ??
          false;
        if (!departmentEscalationEnabled || !employee.primary_department_id) {
          continue;
        }
        const departmentHours = Number(
          policyValues.department_head_escalation_hours ??
            policyValues.departmentHeadEscalationHours ??
            48,
        );
        const departmentDueAt = new Date(
          cutoffAt.getTime() + departmentHours * 3600000,
        );
        if (departmentDueAt > new Date()) continue;
        const department = await this.departmentRepository.findOne({
          where: {
            id: employee.primary_department_id,
            company_id: employee.company_id,
            status: 'active',
          },
        });
        if (!department?.manager_employee_id) continue;
        const departmentHead = await this.employeeRepository.findOne({
          where: {
            id: department.manager_employee_id,
            company_id: employee.company_id,
            employment_status: EmploymentStatusEnum.ACTIVE,
          },
          select: ['id', 'company_id', 'company_user_id'],
        });
        if (
          !departmentHead?.company_user_id ||
          departmentHead.id === employee.id ||
          departmentHead.id === managerEmployee?.id
        ) {
          continue;
        }
        const reportBeforeDepartmentEscalation =
          await this.reportRepository.findOne({
            where: {
              companyId: employee.company_id,
              employeeId: employee.id,
              activityDate: targetDate,
            },
          });
        if (
          reportBeforeDepartmentEscalation &&
          this.isSubmittedReportStatus(reportBeforeDepartmentEscalation.status)
        ) {
          await this.cancelMissingSubmissionActions(
            employee.company_id,
            employee.id,
            targetDate,
          );
          continue;
        }
        await this.actionItemsService.upsertOpen(
          {
            companyId: employee.company_id,
            assigneeCompanyUserId: departmentHead.company_user_id,
            assigneeEmployeeId: departmentHead.id,
            actionType: ActionItemTypeEnum.REMINDER,
            sourceModule: 'WORK_ACTIVITIES',
            sourceEntityType: 'DAILY_ACTIVITY_REPORT',
            sourceEntityId: `${employee.id}:${targetDate}`,
            sourceKey: `daily-activity:missing-escalation:department-head:${employee.id}:${targetDate}`,
            title: 'Missing daily activity report escalation',
            description: `Daily activity report for ${targetDate} remains missing after ${departmentHours} hours.`,
            actionUrl: `/manager/activities/reports?employeeId=${employee.id}&date=${targetDate}`,
            dueAt: departmentDueAt,
            branchId: employee.primary_branch_id,
            departmentId: employee.primary_department_id,
            metadata: {
              escalationLevel: 'DEPARTMENT_HEAD',
              employeeId: employee.id,
              activityDate: targetDate,
              timezone: targetTimezone,
            },
          },
          { reopenCompleted: false },
        );
        created += 1;
      }
    }

    for (const visit of pendingVisits) {
      if (
        !visit.checkOutAt ||
        visit.checkOutAt > overdueCutoff ||
        !visit.managerCompanyUserId
      ) {
        continue;
      }
      await this.actionItemsService.upsertOpen(
        {
          companyId: visit.companyId,
          assigneeCompanyUserId: visit.managerCompanyUserId,
          assigneeEmployeeId: visit.managerEmployeeId ?? null,
          actionType: ActionItemTypeEnum.REMINDER,
          sourceModule: 'WORK_ACTIVITIES',
          sourceEntityType: 'FIELD_VISIT',
          sourceEntityId: visit.id,
          sourceKey: `field-visit:overdue-review:${visit.id}`,
          title: 'Overdue field visit review',
          description: `Field visit ${visit.visitNo} is awaiting your review.`,
          actionUrl: `/manager/field-visits/${visit.id}`,
        },
        { reopenCompleted: false },
      );
      created += 1;
    }

    const today = new Date().toISOString().slice(0, 10);
    for (const followUp of overdueFollowUps) {
      if (followUp.dueDate >= today) {
        continue;
      }

      const employee = await this.employeeRepository.findOne({
        where: {
          id: followUp.assignedToEmployeeId,
          company_id: followUp.companyId,
        },
        select: ['id', 'company_id', 'company_user_id'],
      });
      if (!employee || employee.company_user_id === null) {
        continue;
      }
      await this.actionItemsService.upsertOpen(
        {
          companyId: followUp.companyId,
          assigneeCompanyUserId: employee.company_user_id,
          assigneeEmployeeId: followUp.assignedToEmployeeId,
          actionType: ActionItemTypeEnum.REMINDER,
          sourceModule: 'WORK_ACTIVITIES',
          sourceEntityType: 'FIELD_FOLLOW_UP',
          sourceEntityId: followUp.id,
          sourceKey: `field-follow-up:overdue:${followUp.id}`,
          title: 'Overdue field follow-up',
          description: `Field follow-up due on ${followUp.dueDate} is overdue.`,
          actionUrl: '/me/field-follow-ups',
        },
        { reopenCompleted: false },
      );
      created += 1;
    }

    return created;
  }
}
