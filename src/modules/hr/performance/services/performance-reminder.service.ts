import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Not, Repository } from 'typeorm';
import { NotificationCategoryEnum } from '../../../notifications/enums/notification-category.enum';
import { NotificationPriorityEnum } from '../../../notifications/enums/notification-priority.enum';
import { NotificationTypeEnum } from '../../../notifications/enums/notification-type.enum';
import { NotificationsService } from '../../../notifications/notifications.service';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeKpi } from '../entities/employee-kpi.entity';
import { PerformanceDevelopmentGoal } from '../entities/performance-development-goal.entity';
import { PerformanceImprovementMilestone } from '../entities/performance-improvement-milestone.entity';
import { PerformancePeriodAssignment } from '../entities/performance-period-assignment.entity';
import { EmployeeKpiStatusEnum } from '../enums/employee-kpi-status.enum';
import { PerformanceImprovementMilestoneStatusEnum } from '../enums/performance-improvement-milestone-status.enum';
import { PerformancePeriodAssignmentStatusEnum } from '../enums/performance-period-assignment-status.enum';

@Injectable()
export class PerformanceReminderService {
  private readonly logger = new Logger(PerformanceReminderService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    @InjectRepository(EmployeeKpi)
    private readonly employeeKpiRepository: Repository<EmployeeKpi>,
    @InjectRepository(PerformancePeriodAssignment)
    private readonly assignmentRepository: Repository<PerformancePeriodAssignment>,
    @InjectRepository(PerformanceImprovementMilestone)
    private readonly pipMilestoneRepository: Repository<PerformanceImprovementMilestone>,
    @InjectRepository(PerformanceDevelopmentGoal)
    private readonly developmentGoalRepository: Repository<PerformanceDevelopmentGoal>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async scheduledSweep() {
    try {
      const count = await this.sweep();
      this.logger.log(`Performance reminder sweep created ${count} reminders.`);
    } catch (error) {
      this.logger.error('Performance reminder sweep failed.', error);
    }
  }

  async sweep(today = new Date().toISOString().slice(0, 10)): Promise<number> {
    const notifications = [
      ...(await this.kpiDeadlineReminders(today)),
      ...(await this.appraisalDeadlineReminders(today)),
      ...(await this.pipMilestoneReminders(today)),
      ...(await this.developmentGoalReminders(today)),
    ];
    if (!notifications.length) return 0;
    await this.notificationsService.createAndPushMany(notifications);
    return notifications.length;
  }

  private async kpiDeadlineReminders(today: string) {
    const kpis = await this.employeeKpiRepository.find({
      where: {
        dueDate: LessThanOrEqual(today),
        status: Not(
          In([EmployeeKpiStatusEnum.APPROVED, EmployeeKpiStatusEnum.REJECTED]),
        ),
      },
      take: 500,
    });
    const employees = await this.employeeMap(
      kpis.map((item) => item.employeeId),
    );
    return kpis.flatMap((kpi) => {
      const receiver = employees.get(kpi.employeeId)?.company_user_id;
      if (!receiver) return [];
      return [
        {
          company_id: kpi.companyId,
          receiver_company_user_id: receiver,
          type: NotificationTypeEnum.PERFORMANCE_DEADLINE_REMINDER,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.HIGH,
          title: 'KPI deadline reminder',
          message: `${kpi.title} is due or overdue.`,
          related_module: 'performance',
          entity_type: 'employee_kpi',
          entity_id: kpi.id,
          action_url: '/dashboard/me/performance/kpis',
          dedupe_key: `performance:kpi:${kpi.id}:${today}`,
        },
      ];
    });
  }

  private async appraisalDeadlineReminders(today: string) {
    const assignments = await this.assignmentRepository.find({
      where: {
        status: In([
          PerformancePeriodAssignmentStatusEnum.OPEN,
          PerformancePeriodAssignmentStatusEnum.EMPLOYEE_SUBMITTED,
          PerformancePeriodAssignmentStatusEnum.MANAGER_REVIEW,
          PerformancePeriodAssignmentStatusEnum.HR_REVIEW,
        ]),
      },
      take: 500,
    });
    return assignments
      .filter(
        (item) =>
          item.submittedAt === null ||
          item.submittedAt.toISOString().slice(0, 10) <= today,
      )
      .flatMap((assignment) => {
        const receiver = assignment.managerCompanyUserId ?? null;
        if (!receiver) return [];
        return [
          {
            company_id: assignment.companyId,
            receiver_company_user_id: receiver,
            type: NotificationTypeEnum.PERFORMANCE_DEADLINE_REMINDER,
            category: NotificationCategoryEnum.HR,
            priority: NotificationPriorityEnum.MEDIUM,
            title: 'Appraisal follow-up reminder',
            message: 'A performance appraisal is waiting for action.',
            related_module: 'performance',
            entity_type: 'performance_period_assignment',
            entity_id: assignment.id,
            action_url: '/dashboard/me/performance/team',
            dedupe_key: `performance:assignment:${assignment.id}:${today}`,
          },
        ];
      });
  }

  private async pipMilestoneReminders(today: string) {
    const milestones = await this.pipMilestoneRepository.find({
      where: {
        dueDate: LessThanOrEqual(today),
        status: PerformanceImprovementMilestoneStatusEnum.OPEN,
      },
      relations: { plan: true },
      take: 500,
    });
    const employees = await this.employeeMap(
      milestones.map((item) => item.plan.employeeId),
    );
    return milestones.flatMap((milestone) => {
      const receiver = employees.get(
        milestone.plan.employeeId,
      )?.company_user_id;
      if (!receiver) return [];
      return [
        {
          company_id: milestone.plan.companyId,
          receiver_company_user_id: receiver,
          type: NotificationTypeEnum.PERFORMANCE_PIP_REMINDER,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.HIGH,
          title: 'PIP milestone due',
          message: `${milestone.title} is due or overdue.`,
          related_module: 'performance',
          entity_type: 'performance_improvement_milestone',
          entity_id: milestone.id,
          action_url: '/dashboard/me/performance/improvement',
          dedupe_key: `performance:pip-milestone:${milestone.id}:${today}`,
        },
      ];
    });
  }

  private async developmentGoalReminders(today: string) {
    const goals = await this.developmentGoalRepository.find({
      where: {
        targetDate: LessThanOrEqual(today),
        status: In(['OPEN', 'IN_PROGRESS']),
      },
      relations: { plan: true },
      take: 500,
    });
    const employees = await this.employeeMap(
      goals.map((item) => item.plan.employeeId),
    );
    return goals.flatMap((goal) => {
      const receiver = employees.get(goal.plan.employeeId)?.company_user_id;
      if (!receiver) return [];
      return [
        {
          company_id: goal.companyId,
          receiver_company_user_id: receiver,
          type: NotificationTypeEnum.PERFORMANCE_DEVELOPMENT_REMINDER,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.MEDIUM,
          title: 'Development goal due',
          message: `${goal.title} is due or overdue.`,
          related_module: 'performance',
          entity_type: 'performance_development_goal',
          entity_id: goal.id,
          action_url: '/dashboard/me/performance/development',
          dedupe_key: `performance:development-goal:${goal.id}:${today}`,
        },
      ];
    });
  }

  private async employeeMap(employeeIds: number[]) {
    const uniqueIds = Array.from(new Set(employeeIds.filter(Boolean)));
    if (!uniqueIds.length) return new Map<number, Employee>();
    const employees = await this.employeeRepository.find({
      where: { id: In(uniqueIds) },
    });
    return new Map(employees.map((employee) => [employee.id, employee]));
  }
}
