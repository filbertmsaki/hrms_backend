import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, Not, Repository } from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { CompanyUserRole } from '../../../companies/entities/company-user-role.entity';
import { Role } from '../../../roles/entities/role.entity';
import { NotificationCategoryEnum } from '../../../notifications/enums/notification-category.enum';
import { NotificationPriorityEnum } from '../../../notifications/enums/notification-priority.enum';
import { NotificationTypeEnum } from '../../../notifications/enums/notification-type.enum';
import { NotificationsService } from '../../../notifications/notifications.service';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeKpi } from '../entities/employee-kpi.entity';
import { EmployeeKpiCycleReview } from '../entities/employee-kpi-cycle-review.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import { kpiCycleToday } from '../utils/kpi-cycle-date';
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
    @InjectRepository(PerformancePeriod)
    private readonly periodRepository: Repository<PerformancePeriod>,
    @InjectRepository(EmployeeKpiCycleReview)
    private readonly cycleReviewRepository: Repository<EmployeeKpiCycleReview>,
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    @InjectRepository(CompanyUserRole)
    private readonly companyUserRoleRepository: Repository<CompanyUserRole>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
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

  async sweep(today = kpiCycleToday()): Promise<number> {
    const notifications = [
      ...(await this.kpiDeadlineReminders(today)),
      ...(await this.kpiCycleReminders(today)),
      ...(await this.appraisalDeadlineReminders(today)),
      ...(await this.pipMilestoneReminders(today)),
      ...(await this.developmentGoalReminders(today)),
    ];
    if (!notifications.length) return 0;
    await this.notificationsService.createAndPushMany(notifications);
    return notifications.length;
  }

  private async kpiCycleReminders(today: string) {
    const periods = await this.periodRepository.find({
      where: {
        kpiPhase: In([
          'GOAL_SETTING',
          'IN_PROGRESS',
          'MID_REVIEW',
          'FINAL_REVIEW',
        ]),
      },
    });
    const reminders: Array<
      Parameters<NotificationsService['createAndPushMany']>[0][number]
    > = [];
    for (const period of periods) {
      const deadlines = [
        { key: 'goal', date: period.goalSettingDeadline, kind: null },
        { key: 'mid', date: period.midCycleReviewDate, kind: 'MID' },
        { key: 'final', date: period.finalReviewDeadline, kind: 'FINAL' },
      ];
      const kpis = await this.employeeKpiRepository.find({
        where: { companyId: period.companyId, performancePeriodId: period.id },
      });
      const cycleAssignments = await this.assignmentRepository.find({
        where: { companyId: period.companyId, performancePeriodId: period.id },
      });
      const assignees = await this.employeeMap(
        kpis.map((kpi) => kpi.employeeId),
      );
      const employees = await this.employeeMap([
        ...kpis.map((kpi) => kpi.employeeId),
        ...cycleAssignments.map((assignment) => assignment.employeeId),
        ...[...assignees.values()].map((employee) => employee.reports_to ?? -1),
      ]);
      const reviews = await this.cycleReviewRepository.find({
        where: { companyId: period.companyId, performancePeriodId: period.id },
      });
      const hrRecipients = await this.hrRecipients(period.companyId);
      for (const deadline of deadlines) {
        if (!deadline.date) continue;
        const offset = Math.round(
          (Date.parse(`${today}T00:00:00Z`) -
            Date.parse(`${deadline.date}T00:00:00Z`)) /
            86400000,
        );
        if (![-3, -1, 0, 1, 3, 7].includes(offset)) continue;
        for (const kpi of kpis) {
          if (kpi.status === EmployeeKpiStatusEnum.REJECTED) continue;
          const review = reviews.find(
            (row) => row.employeeKpiId === kpi.id && row.kind === deadline.kind,
          );
          const incomplete =
            deadline.key === 'goal'
              ? kpi.status !== EmployeeKpiStatusEnum.APPROVED
              : review?.status !== 'FINALIZED' &&
                (deadline.key !== 'mid' || review?.status !== 'ACKNOWLEDGED');
          if (!incomplete) continue;
          const employee = employees.get(kpi.employeeId);
          const receiver =
            offset >= 7
              ? period.createdByCompanyUserId
              : offset >= 1
                ? (employees.get(employee?.reports_to ?? -1)?.company_user_id ??
                  period.createdByCompanyUserId)
                : employee?.company_user_id;
          const receivers =
            offset === 3 ? hrRecipients : receiver ? [receiver] : [];
          for (const recipient of receivers)
            reminders.push({
              company_id: period.companyId,
              receiver_company_user_id: recipient,
              type: NotificationTypeEnum.PERFORMANCE_DEADLINE_REMINDER,
              category: NotificationCategoryEnum.HR,
              priority:
                offset >= 0
                  ? NotificationPriorityEnum.HIGH
                  : NotificationPriorityEnum.MEDIUM,
              title: `KPI ${deadline.key} deadline ${offset > 0 ? 'overdue' : 'reminder'}`,
              message: `${kpi.title} requires ${deadline.key === 'goal' ? 'approval' : 'review'} in ${period.name}.`,
              related_module: 'performance',
              entity_type: 'employee_kpi',
              entity_id: kpi.id,
              action_url: '/dashboard/me/performance/kpis',
              dedupe_key: `performance:cycle:${period.id}:${deadline.key}:${kpi.id}:${offset}:${recipient}`,
            });
        }
        if (deadline.key === 'goal')
          for (const assignment of cycleAssignments.filter(
            (item) =>
              !kpis.some(
                (kpi) =>
                  kpi.employeeId === item.employeeId &&
                  kpi.status !== EmployeeKpiStatusEnum.REJECTED,
              ),
          )) {
            const employee = employees.get(assignment.employeeId);
            const receiver =
              offset >= 7
                ? period.createdByCompanyUserId
                : offset >= 1
                  ? (assignment.managerCompanyUserId ??
                    period.createdByCompanyUserId)
                  : employee?.company_user_id;
            const receivers =
              offset === 3 ? hrRecipients : receiver ? [receiver] : [];
            for (const recipient of receivers)
              reminders.push({
                company_id: period.companyId,
                receiver_company_user_id: recipient,
                type: NotificationTypeEnum.PERFORMANCE_DEADLINE_REMINDER,
                category: NotificationCategoryEnum.HR,
                priority:
                  offset >= 0
                    ? NotificationPriorityEnum.HIGH
                    : NotificationPriorityEnum.MEDIUM,
                title: 'KPI goal-setting deadline',
                message: `No KPIs have been submitted for ${period.name}.`,
                related_module: 'performance',
                entity_type: 'performance_period_assignment',
                entity_id: assignment.id,
                action_url: '/dashboard/me/performance/kpis',
                dedupe_key: `performance:cycle:${period.id}:goal:missing:${assignment.id}:${offset}:${recipient}`,
              });
          }
      }
    }
    return reminders;
  }

  private async hrRecipients(companyId: number): Promise<number[]> {
    const roles = await this.roleRepository.find({
      where: [{ company_id: companyId }, { company_id: IsNull() }],
      relations: { permissions: true },
    });
    const roleIds = roles
      .filter((role) =>
        role.permissions.some(
          (permission) => permission.name === 'performance_periods:reopen',
        ),
      )
      .map((role) => role.id);
    if (!roleIds.length) return [];
    const assignments = await this.companyUserRoleRepository.find({
      where: { role_id: In(roleIds) },
    });
    if (!assignments.length) return [];
    const users = await this.companyUserRepository.find({
      where: {
        id: In(assignments.map((assignment) => assignment.company_user_id)),
        company_id: companyId,
        status: 'active',
      },
    });
    return users.map((user) => user.id);
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
