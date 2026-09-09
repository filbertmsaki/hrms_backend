import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActionItemTypeEnum } from '../../action-inbox/enums/action-item-type.enum';
import { ActionItemsService } from '../../action-inbox/action-items.service';
import { Employee } from '../../employees/entities/employee.entity';
import { DailyActivityReport } from '../entities/daily-activity.entities';
import { FieldFollowUp, FieldVisit } from '../entities/field-visit.entities';
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
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(DailyActivityReport)
    private readonly reportRepository: Repository<DailyActivityReport>,
    @InjectRepository(FieldVisit)
    private readonly visitRepository: Repository<FieldVisit>,
    @InjectRepository(FieldFollowUp)
    private readonly followUpRepository: Repository<FieldFollowUp>,
  ) {}

  @Cron(process.env.ACTIVITY_REMINDER_CRON || '0 0 18 * * *')
  async sendSubmissionReminders() {
    const targetDate = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
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
      ],
    });

    let created = 0;

    for (const employee of activeEmployees) {
      if (employee.company_user_id === null) {
        continue;
      }
      const approvedCount = await this.reportRepository.count({
        where: {
          companyId: employee.company_id,
          employeeId: employee.id,
          activityDate: targetDate,
          status: DailyActivityReportStatusEnum.APPROVED,
        },
      });

      if (approvedCount > 0) {
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
    const managerReviewDueHours = this.configService.get<number>(
      'ACTIVITY_MANAGER_REVIEW_DUE_HOURS',
      24,
    );
    const overdueCutoff = new Date(
      Date.now() - managerReviewDueHours * 3600000,
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
      if (
        !report.submittedAt ||
        report.submittedAt > overdueCutoff ||
        !report.managerCompanyUserId
      ) {
        continue;
      }
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
