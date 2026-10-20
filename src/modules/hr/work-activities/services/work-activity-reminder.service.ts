import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActionItemTypeEnum } from '../../action-inbox/enums/action-item-type.enum';
import { ActionItemsService } from '../../action-inbox/action-items.service';
import { Employee } from '../../employees/entities/employee.entity';
import { Department } from '../../departments/entities/department.entity';
import { DailyActivityReport } from '../entities/daily-activity.entities';
import { FieldFollowUp, FieldVisit } from '../entities/field-visit.entities';
import { ActivityPolicyService } from './activity-policy.service';
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

  private previousDate(date: string) {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() - 1);
    return value.toISOString().slice(0, 10);
  }

  @Cron(process.env.ACTIVITY_REMINDER_CRON || '0 0 18 * * *')
  async sendSubmissionReminders() {
    const now = new Date();
    const activeEmployees = await this.employeeRepository.find({
      where: { employment_status: 'ACTIVE' as never },
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
      ],
    });

    let created = 0;

    for (const employee of activeEmployees) {
      if (employee.company_user_id === null) {
        continue;
      }
      const initialPolicy = await this.activityPolicyService.resolveForEmployee(
        employee.company_id,
        employee,
        now.toISOString().slice(0, 10),
      );
      const initialTimezone =
        (initialPolicy as { submissionTimezone?: string }).submissionTimezone ??
        'UTC';
      const localDate = this.localDateTime(now, initialTimezone).date;
      const policy = await this.activityPolicyService.resolveForEmployee(
        employee.company_id,
        employee,
        localDate,
      );
      const policyValues = policy as {
        dailySubmissionRequired?: boolean;
        submissionTimezone?: string;
        submissionCutoffTime?: string;
      };
      if (policyValues.dailySubmissionRequired === false) continue;
      const timeZone = policyValues.submissionTimezone || 'UTC';
      const localNow = this.localDateTime(now, timeZone);
      const cutoff = policyValues.submissionCutoffTime || '20:00';
      const targetDate =
        localNow.time >= cutoff
          ? localNow.date
          : this.previousDate(localNow.date);
      const report = await this.reportRepository.findOne({
        where: {
          companyId: employee.company_id,
          employeeId: employee.id,
          activityDate: targetDate,
        },
      });

      if (report && report.status !== DailyActivityReportStatusEnum.DRAFT) {
        continue;
      }

      await this.actionItemsService.upsertOpen({
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
      });
      created += 1;
    }

    return created;
  }

  @Cron(process.env.ACTIVITY_ESCALATION_CRON || '0 30 21 * * *')
  async sendReviewAndFollowUpReminders() {
    const fallbackManagerReviewDueHours = this.configService.get<number>(
      'ACTIVITY_MANAGER_REVIEW_DUE_HOURS',
      24,
    );
    const overdueCutoff = new Date(
      Date.now() - fallbackManagerReviewDueHours * 3600000,
    );

    const pendingReports = await this.reportRepository.find({
      where: { status: DailyActivityReportStatusEnum.MANAGER_REVIEW_PENDING },
      take: 100,
      order: { submittedAt: 'ASC', id: 'ASC' },
    });
    const pendingVisits = await this.visitRepository.find({
      where: { status: FieldVisitStatusEnum.MANAGER_REVIEW_PENDING },
      take: 100,
      order: { checkOutAt: 'ASC', id: 'ASC' },
    });
    const overdueFollowUps = await this.followUpRepository.find({
      where: { status: FieldFollowUpStatusEnum.OPEN },
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
        await this.actionItemsService.upsertOpen({
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
        });
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
          employment_status: 'ACTIVE' as never,
        },
      });
      if (
        !departmentHead?.company_user_id ||
        departmentHead.id === report.managerEmployeeId
      )
        continue;
      await this.actionItemsService.upsertOpen({
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
      });
      created += 1;
    }

    for (const visit of pendingVisits) {
      if (
        !visit.checkOutAt ||
        visit.checkOutAt > overdueCutoff ||
        !visit.managerCompanyUserId
      ) {
        continue;
      }
      await this.actionItemsService.upsertOpen({
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
      });
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
      await this.actionItemsService.upsertOpen({
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
      });
      created += 1;
    }

    return created;
  }
}
