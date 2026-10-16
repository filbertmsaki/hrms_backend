import { Document } from '../../documents/entities/document.entity';
import { DocumentEntityTypeEnum } from '../../documents/enums/document-entity-type.enum';
import {
  assertDateRange,
  assertUniqueValues,
} from '../../performance/utils/workflow-validation';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ActionItemTypeEnum } from '../../action-inbox/enums/action-item-type.enum';
import { ActionItemsService } from '../../action-inbox/action-items.service';
import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  AddDailyActivityEvidenceDto,
  CreateDailyActivityCommentDto,
  CreateDailyActivityEntryDto,
  CreateManagerActivityTaskDto,
  CreateSelfActivityTaskDto,
  UpdateDailyActivityEntryDto,
  SubmitDailyActivityReportDto,
  ReviewDailyActivityReportDto,
} from '../dto/activity.dto';
import { WorkActivityQueryDto } from '../dto/queries.dto';
import { ActivityCategory } from '../entities/activity-config.entities';
import {
  DailyActivityEntry,
  DailyActivityEvidence,
  DailyActivityComment,
  DailyActivityReport,
} from '../entities/daily-activity.entities';
import {
  DailyActivityEntryReviewStatusEnum,
  DailyActivityOriginEnum,
  DailyActivityReportStatusEnum,
  DailyActivityPriorityEnum,
  DailyActivityReviewDecisionEnum,
  DailyActivitySourceEnum,
  DailyActivityStatusEnum,
} from '../enums/work-activity.enums';
import { EmployeeKpi } from '../../performance/entities/employee-kpi.entity';
import { EmployeeKpiStatusEnum } from '../../performance/enums/employee-kpi-status.enum';
import { PerformancePeriodStatusEnum } from '../../performance/enums/performance-period-status.enum';
import { ActivityPolicyService } from './activity-policy.service';
import { WorkActivityAuditService } from './work-activity-audit.service';
import { WorkActivityExceptionService } from './work-activity-exception.service';
import { DefaultAvatarsService } from '../../default-avatars/default-avatars.service';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { NotificationsService } from '../../../notifications/notifications.service';
import { NotificationCategoryEnum } from '../../../notifications/enums/notification-category.enum';
import { NotificationChannelEnum } from '../../../notifications/enums/notification-channel.enum';
import { NotificationPriorityEnum } from '../../../notifications/enums/notification-priority.enum';
import { NotificationTypeEnum } from '../../../notifications/enums/notification-type.enum';

@Injectable()
export class DailyActivityService {
  private readonly logger = new Logger(DailyActivityService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly actionItemsService: ActionItemsService,
    private readonly notificationsService: NotificationsService,
    private readonly policyService: ActivityPolicyService,
    private readonly auditService: WorkActivityAuditService,
    private readonly exceptionService: WorkActivityExceptionService,
    private readonly defaultAvatarsService: DefaultAvatarsService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(ActivityCategory)
    private readonly categoryRepository: Repository<ActivityCategory>,
    @InjectRepository(DailyActivityReport)
    private readonly reportRepository: Repository<DailyActivityReport>,
    @InjectRepository(DailyActivityEntry)
    private readonly entryRepository: Repository<DailyActivityEntry>,
    @InjectRepository(DailyActivityEvidence)
    private readonly evidenceRepository: Repository<DailyActivityEvidence>,
    @InjectRepository(DailyActivityComment)
    private readonly commentRepository: Repository<DailyActivityComment>,
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(EmployeeKpi)
    private readonly employeeKpiRepository: Repository<EmployeeKpi>,
  ) {}

  private getCompanyId(actor: AuthenticatedUser): number {
    return this.hrAccessService.ensureActorCompanyId(actor);
  }

  private getEmployeeId(actor: AuthenticatedUser): number {
    if (!actor.employeeId) {
      throw new ForbiddenException('Employee profile is required.');
    }
    return actor.employeeId;
  }

  private toText(value: unknown, fallback = ''): string {
    if (typeof value === 'string') {
      return value;
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }

    return fallback;
  }

  private async getEmployee(companyId: number, employeeId: number) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, company_id: companyId },
      relations: { default_avatar: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    return employee;
  }

  async listMine(actor: AuthenticatedUser, query: WorkActivityQueryDto) {
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const qb = this.reportRepository
      .createQueryBuilder('report')
      .where('report.companyId = :companyId', { companyId })
      .andWhere('report.employeeId = :employeeId', { employeeId })
      .orderBy('report.activityDate', 'DESC')
      .addOrderBy('report.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.date_from) {
      qb.andWhere('report.activityDate >= :dateFrom', {
        dateFrom: query.date_from,
      });
    }
    if (query.date_to) {
      qb.andWhere('report.activityDate <= :dateTo', { dateTo: query.date_to });
    }
    if (query.status) {
      qb.andWhere('report.status = :status', { status: query.status });
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      data: await Promise.all(
        items.map((item) => this.getReportResponse(item)),
      ),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async listForManager(actor: AuthenticatedUser, query: WorkActivityQueryDto) {
    return this.listScoped(actor, query, false);
  }

  async listMineTasks(actor: AuthenticatedUser, query: WorkActivityQueryDto) {
    const reports = await this.listMine(actor, { ...query, limit: 100 });
    return this.filterTaskRows(this.flattenTaskRows(reports.data), query);
  }

  async listManagerTasks(
    actor: AuthenticatedUser,
    query: WorkActivityQueryDto,
  ) {
    const reports = await this.listForManager(actor, { ...query, limit: 100 });
    const flattened = this.flattenTaskRows(reports.data);
    const actorEmployeeId = actor.employeeId ?? null;
    const data = flattened.data.filter((row) => {
      const employeeId = Number(row.employee_id ?? row.employeeId);
      if (actorEmployeeId != null && employeeId === actorEmployeeId) {
        return false;
      }
      return this.isManagerAssignedTaskRow(row);
    });
    return {
      ...this.filterTaskRows({ data, meta: { total: data.length } }, query),
    };
  }

  async listManagerAssignees(actor: AuthenticatedUser) {
    const companyId = this.getCompanyId(actor);
    const qb = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.primary_department', 'department')
      .leftJoinAndSelect('employee.primary_position', 'position')
      .leftJoinAndSelect('employee.default_avatar', 'defaultAvatar')
      .where('employee.company_id = :companyId', { companyId })
      .andWhere('employee.employment_status = :employmentStatus', {
        employmentStatus: EmploymentStatusEnum.ACTIVE,
      })
      .andWhere('employee.id != :actorEmployeeId', {
        actorEmployeeId: actor.employeeId ?? -1,
      });
    const accessibleEmployeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);
    if (accessibleEmployeeIds !== null) {
      if (accessibleEmployeeIds.length === 0) return [];
      qb.andWhere('employee.id IN (:...accessibleEmployeeIds)', {
        accessibleEmployeeIds,
      });
    }
    const employees = await qb
      .orderBy('employee.first_name', 'ASC')
      .addOrderBy('employee.last_name', 'ASC')
      .getMany();
    return Promise.all(
      employees.map(async (employee) => {
        const photo = await this.employeePhotoUrl(employee);
        return {
          id: employee.id,
          employee_no: employee.employee_no,
          full_name: [
            employee.first_name,
            employee.middle_name,
            employee.last_name,
          ]
            .filter(Boolean)
            .join(' '),
          profile_photo_url: photo,
          department: employee.primary_department,
          position: employee.primary_position,
        };
      }),
    );
  }

  private isManagerAssignedTaskRow(row: Record<string, unknown>) {
    const candidates = [
      row.taskReference,
      row.task_reference,
      row.externalReferenceType,
      row.external_reference_type,
    ];
    const reference = (
      candidates.find((value): value is string => typeof value === 'string') ??
      ''
    ).toUpperCase();
    return reference.includes('MANAGER') && !reference.includes('SELF');
  }

  private flattenTaskRows(reports: Array<Record<string, unknown>>) {
    const data: Array<Record<string, unknown>> = [];
    for (const report of reports) {
      const entries = Array.isArray(report.entries) ? report.entries : [];
      for (const value of entries) {
        if (!value || typeof value !== 'object' || Array.isArray(value))
          continue;
        data.push({
          ...(value as Record<string, unknown>),
          report_id: report.id,
          activity_date: report.activityDate,
          report_status: report.status,
          employee_id: report.employeeId,
          employee: report.employeeSnapshot,
        });
      }
    }

    return {
      data,
      meta: { total: data.length },
    };
  }

  private filterTaskRows(
    result: {
      data: Array<Record<string, unknown>>;
      meta: Record<string, unknown>;
    },
    query: WorkActivityQueryDto,
  ) {
    const now = new Date();
    const data = result.data.filter((row) => {
      if (
        query.employee_kpi_id !== undefined &&
        Number(row.employeeKpiId ?? row.employee_kpi_id) !==
          query.employee_kpi_id
      ) {
        return false;
      }
      if (
        query.assigned_by_employee_id !== undefined &&
        Number(row.assignedByEmployeeId ?? row.assigned_by_employee_id) !==
          query.assigned_by_employee_id
      ) {
        return false;
      }
      if (query.origin && row.origin !== query.origin) return false;
      if (query.work_status && row.status !== query.work_status) return false;
      if (
        query.review_status &&
        (row.reviewStatus ?? row.review_status) !== query.review_status
      ) {
        return false;
      }
      if (query.priority && row.priority !== query.priority) return false;
      if (query.overdue !== undefined) {
        const rawDueDate = row.dueDate ?? row.due_date ?? row.plannedEndTime;
        const dueDate =
          rawDueDate instanceof Date
            ? rawDueDate
            : typeof rawDueDate === 'string' || typeof rawDueDate === 'number'
              ? new Date(rawDueDate)
              : null;
        const overdue =
          dueDate !== null &&
          !Number.isNaN(dueDate.getTime()) &&
          dueDate < now &&
          ![
            DailyActivityStatusEnum.COMPLETED,
            DailyActivityStatusEnum.CANCELLED,
          ].includes(row.status as DailyActivityStatusEnum);
        if (overdue !== query.overdue) return false;
      }
      return true;
    });
    return { data, meta: { ...result.meta, total: data.length } };
  }

  private assigneeIdsFromDto(dto: CreateManagerActivityTaskDto) {
    return [
      ...new Set(
        [
          ...(Array.isArray(dto.employee_ids) ? dto.employee_ids : []),
          ...(dto.employee_id != null ? [dto.employee_id] : []),
        ]
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    ];
  }

  async createManagerTask(
    actor: AuthenticatedUser,
    dto: CreateManagerActivityTaskDto,
  ) {
    assertDateRange(dto.activity_date, dto.due_date?.slice(0, 10), 'Activity');
    const assigneeIds = this.assigneeIdsFromDto(dto);
    if (assigneeIds.length === 0) {
      throw new BadRequestException('Choose at least one employee.');
    }
    if (assigneeIds.length === 1) {
      return this.createManagerTaskForEmployee(actor, {
        ...dto,
        employee_id: assigneeIds[0],
      });
    }

    const data: Array<
      Awaited<ReturnType<DailyActivityService['createManagerTaskForEmployee']>>
    > = [];
    for (const employeeId of assigneeIds) {
      data.push(
        await this.createManagerTaskForEmployee(actor, {
          ...dto,
          employee_id: employeeId,
        }),
      );
    }
    return {
      assigned: data.length,
      data,
    };
  }

  private async createManagerTaskForEmployee(
    actor: AuthenticatedUser,
    dto: CreateManagerActivityTaskDto & { employee_id: number },
  ) {
    const companyId = this.getCompanyId(actor);
    const employee = await this.getEmployee(companyId, dto.employee_id);
    await this.assertManagerCanAssign(actor, employee);
    await this.assertKpiLink(companyId, employee.id, dto.employee_kpi_id);
    const category = await this.resolveManagerTaskCategory(
      companyId,
      dto.activity_category_id,
    );
    const entryDto: CreateDailyActivityEntryDto = {
      activity_category_id: category.id,
      title: dto.title,
      description: dto.description,
      planned_start_time: dto.planned_start_time,
      planned_end_time: dto.planned_end_time,
      task_reference: 'MANAGER_ASSIGNED',
      status: DailyActivityStatusEnum.PLANNED,
      priority: dto.priority ?? DailyActivityPriorityEnum.MEDIUM,
      checklist: dto.checklist,
      employee_kpi_id: dto.employee_kpi_id,
      expected_result: dto.expected_result,
      due_date: dto.due_date,
    };
    this.validateEntry(entryDto, category);

    const created = await this.dataSource.transaction(async (manager) => {
      const report = await this.resolveEditableReport(manager, {
        companyId,
        employee,
        preferredDate: dto.activity_date,
        source: DailyActivitySourceEnum.SYSTEM,
        metadata: { manager_assigned_task: true },
      });
      const entry = await this.saveTaskEntry(manager, {
        actor,
        companyId,
        report,
        categoryId: category.id,
        dto,
        taskReference: 'MANAGER_ASSIGNED',
        externalReferenceType: 'MANAGER_TASK',
        origin: DailyActivityOriginEnum.ASSIGNED,
      });
      return {
        entry,
        response: await this.getReportResponse(report, manager),
      };
    });
    await this.auditService.log({
      action: 'DAILY_ACTIVITY_ASSIGNED',
      actor,
      employeeId: employee.id,
      entityType: 'DAILY_ACTIVITY_ENTRY',
      entityId: created.entry.id,
      afterValues: {
        title: created.entry.title,
        due_date: created.entry.dueDate,
        employee_kpi_id: created.entry.employeeKpiId,
      },
    });
    void this.notifyActivityAssigned(actor, employee, created.entry);
    return created.response;
  }

  async createMyTask(actor: AuthenticatedUser, dto: CreateSelfActivityTaskDto) {
    assertDateRange(dto.activity_date, dto.due_date?.slice(0, 10), 'Activity');
    const companyId = this.getCompanyId(actor);
    const employee = await this.getEmployee(
      companyId,
      this.getEmployeeId(actor),
    );
    const category = await this.resolveManagerTaskCategory(
      companyId,
      dto.activity_category_id,
    );
    await this.assertKpiLink(companyId, employee.id, dto.employee_kpi_id);
    const entryDto: CreateDailyActivityEntryDto = {
      activity_category_id: category.id,
      title: dto.title,
      description: dto.description,
      planned_start_time: dto.planned_start_time,
      planned_end_time: dto.planned_end_time,
      task_reference: 'SELF_CREATED',
      status: DailyActivityStatusEnum.PLANNED,
      priority: dto.priority ?? DailyActivityPriorityEnum.MEDIUM,
      checklist: dto.checklist,
      employee_kpi_id: dto.employee_kpi_id,
      expected_result: dto.expected_result,
      due_date: dto.due_date,
    };
    this.validateEntry(entryDto, category);

    const created = await this.dataSource.transaction(async (manager) => {
      const report = await this.resolveEditableReport(manager, {
        companyId,
        employee,
        preferredDate: dto.activity_date,
        source: DailyActivitySourceEnum.WEB,
        metadata: { self_created_task: true },
      });
      const entry = await this.saveTaskEntry(manager, {
        actor,
        companyId,
        report,
        categoryId: category.id,
        dto,
        taskReference: 'SELF_CREATED',
        externalReferenceType: 'SELF_TASK',
        origin: DailyActivityOriginEnum.SELF_CREATED,
      });
      return {
        entry,
        response: await this.getReportResponse(report, manager),
      };
    });
    await this.auditService.log({
      action: 'DAILY_ACTIVITY_CREATED',
      actor,
      employeeId: employee.id,
      entityType: 'DAILY_ACTIVITY_ENTRY',
      entityId: created.entry.id,
      afterValues: {
        title: created.entry.title,
        due_date: created.entry.dueDate,
        employee_kpi_id: created.entry.employeeKpiId,
      },
    });
    return created.response;
  }

  private isEditableReportStatus(status: DailyActivityReportStatusEnum) {
    return [
      DailyActivityReportStatusEnum.DRAFT,
      DailyActivityReportStatusEnum.RETURNED_FOR_CORRECTION,
    ].includes(status);
  }

  private addDays(date: string, days: number) {
    const value = new Date(`${date}T12:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }

  private dateOnly(value: Date | string | null | undefined) {
    if (!value) return '';
    if (value instanceof Date) {
      return Number.isNaN(value.getTime())
        ? ''
        : value.toISOString().slice(0, 10);
    }
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match?.[1] ?? '';
  }

  private deferDateForEntry(entry: DailyActivityEntry, reportDate: string) {
    const due = this.dateOnly(entry.plannedEndTime);
    if (due && due > reportDate) return due;
    const start = this.dateOnly(entry.plannedStartTime);
    if (start && start > reportDate) return start;
    return this.addDays(reportDate, 1);
  }

  private async keepSelectedEntries(
    manager: EntityManager,
    report: DailyActivityReport,
    entries: DailyActivityEntry[],
    selectedIds: number[],
  ) {
    const selected = new Set(selectedIds.map((id) => Number(id)));
    const keep = entries.filter((entry) => selected.has(entry.id));
    const defer = entries.filter((entry) => !selected.has(entry.id));

    if (keep.length !== selected.size) {
      throw new BadRequestException(
        'One or more selected work items are not on this day.',
      );
    }
    if (keep.length === 0) {
      throw new BadRequestException(
        'Select at least one completed work item to close this day.',
      );
    }
    const incomplete = keep.filter(
      (entry) => entry.status !== DailyActivityStatusEnum.COMPLETED,
    );
    if (incomplete.length > 0) {
      throw new BadRequestException(
        'In-progress work cannot be submitted. Leave it unchecked so it stays open.',
      );
    }
    if (defer.length === 0) return keep;

    const employee = await this.getEmployee(
      report.companyId,
      report.employeeId,
    );
    const byDate = new Map<string, DailyActivityEntry[]>();
    for (const entry of defer) {
      const nextDate = this.deferDateForEntry(entry, report.activityDate);
      const bucket = byDate.get(nextDate) ?? [];
      bucket.push(entry);
      byDate.set(nextDate, bucket);
    }

    for (const [activityDate, moving] of byDate) {
      const target = await this.resolveEditableReport(manager, {
        companyId: report.companyId,
        employee,
        preferredDate: activityDate,
        source: DailyActivitySourceEnum.WEB,
        metadata: { deferred_from_report_id: report.id },
      });
      for (const entry of moving) {
        entry.dailyActivityReportId = target.id;
      }
      await manager.getRepository(DailyActivityEntry).save(moving);
    }

    return keep;
  }

  private async resolveEditableReport(
    manager: EntityManager,
    params: {
      companyId: number;
      employee: Employee;
      preferredDate: string;
      source: DailyActivitySourceEnum;
      metadata?: Record<string, unknown> | null;
    },
  ) {
    const { companyId, employee, preferredDate, source, metadata } = params;
    const repo = manager.getRepository(DailyActivityReport);

    const tryDate = async (activityDate: string) => {
      const existing = await repo.findOne({
        where: { companyId, employeeId: employee.id, activityDate },
      });
      if (!existing) {
        const policy = await this.policyService.resolveForEmployee(
          companyId,
          employee,
          activityDate,
        );
        return repo.save(
          repo.create({
            companyId,
            employeeId: employee.id,
            activityDate,
            status: DailyActivityReportStatusEnum.DRAFT,
            managerEmployeeId: employee.reports_to ?? null,
            managerCompanyUserId: await this.resolveManagerCompanyUserId(
              employee.reports_to,
            ),
            employeeSnapshot: await this.buildEmployeeSnapshot(employee),
            policySnapshot: this.normalizePolicySnapshot(policy),
            attendanceSnapshot: null,
            clientRequestId: null,
            source,
            metadata: metadata ?? null,
          }),
        );
      }
      return this.isEditableReportStatus(existing.status) ? existing : null;
    };

    const preferred = await tryDate(preferredDate);
    if (preferred) return preferred;

    for (let offset = 1; offset <= 14; offset += 1) {
      const next = await tryDate(this.addDays(preferredDate, offset));
      if (next) return next;
    }

    throw new ConflictException(
      'The report for this date is already submitted. Choose another start date.',
    );
  }

  private async saveTaskEntry(
    manager: EntityManager,
    params: {
      actor: AuthenticatedUser;
      companyId: number;
      report: DailyActivityReport;
      categoryId: number;
      dto: CreateManagerActivityTaskDto | CreateSelfActivityTaskDto;
      taskReference: string;
      externalReferenceType: string;
      origin: DailyActivityOriginEnum;
    },
  ) {
    const {
      actor,
      companyId,
      report,
      categoryId,
      dto,
      taskReference,
      externalReferenceType,
      origin,
    } = params;
    return manager.getRepository(DailyActivityEntry).save(
      manager.getRepository(DailyActivityEntry).create({
        companyId,
        dailyActivityReportId: report.id,
        activityCategoryId: categoryId,
        kpiDefinitionId: null,
        employeeKpiId: dto.employee_kpi_id ?? null,
        projectReference: null,
        taskReference,
        fieldPartyId: null,
        externalReferenceType,
        externalReferenceId: String(actor.id),
        title: dto.title.trim(),
        description: dto.description.trim(),
        expectedResult: dto.expected_result?.trim() ?? null,
        dueDate: dto.due_date ? new Date(dto.due_date) : null,
        completionDate: null,
        plannedStartTime: dto.planned_start_time
          ? new Date(dto.planned_start_time)
          : new Date(`${report.activityDate}T09:00:00.000Z`),
        plannedEndTime: dto.planned_end_time
          ? new Date(dto.planned_end_time)
          : null,
        actualStartTime: null,
        actualEndTime: null,
        status: DailyActivityStatusEnum.PLANNED,
        origin,
        reviewStatus: DailyActivityEntryReviewStatusEnum.NOT_REQUIRED,
        reviewedAt: null,
        reviewedByCompanyUserId: null,
        outcome: null,
        remarks: null,
        deferReason: null,
        followUpDate: null,
        completionPercentage: '0',
        managerComment: null,
        managerValidated: false,
        priority: dto.priority ?? DailyActivityPriorityEnum.MEDIUM,
        assignedByCompanyUserId: actor.companyMembershipId ?? actor.id ?? null,
        assignedByEmployeeId: actor.employeeId ?? null,
        assignedBySnapshot: actor.employeeId
          ? await this.buildEmployeeSnapshot(
              await this.getEmployee(companyId, actor.employeeId),
            )
          : null,
        checklist: (dto.checklist ?? []).map((item) => ({
          id: item.id,
          title: item.title.trim(),
          completed: item.completed === true,
        })),
        linkedFieldVisitId: null,
        clientRequestId: null,
      }),
    );
  }

  private async notifyActivityAssigned(
    actor: AuthenticatedUser,
    employee: Employee,
    entry: DailyActivityEntry,
  ): Promise<void> {
    if (!employee.company_user_id) return;
    try {
      await this.notificationsService.createAndPush({
        company_id: employee.company_id,
        sender_company_user_id: actor.companyMembershipId ?? null,
        receiver_company_user_id: employee.company_user_id,
        category: NotificationCategoryEnum.HR,
        priority:
          entry.priority === DailyActivityPriorityEnum.URGENT
            ? NotificationPriorityEnum.URGENT
            : NotificationPriorityEnum.MEDIUM,
        title: 'Activity assigned',
        message: entry.title,
        related_module: 'WORK_ACTIVITIES',
        entity_type: 'DAILY_ACTIVITY_ENTRY',
        entity_id: entry.id,
        action_url: `/dashboard/me/activities/today?task=${entry.id}`,
        dedupe_key: `activity-assigned:${entry.id}`,
      });
    } catch (error) {
      this.logger.warn(
        `Activity ${entry.id} was assigned, but notification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async resolveManagerTaskCategory(
    companyId: number,
    categoryId?: number,
  ) {
    if (categoryId !== undefined) {
      return this.policyService.getCategoryOrFail(companyId, categoryId);
    }

    const existing = await this.categoryRepository.findOne({
      where: { companyId, code: 'MANAGER_ASSIGNED' },
    });
    if (existing) {
      if (existing.status !== 'ACTIVE') {
        existing.status = 'ACTIVE';
        return this.categoryRepository.save(existing);
      }
      return existing;
    }

    return this.categoryRepository.save(
      this.categoryRepository.create({
        companyId,
        code: 'MANAGER_ASSIGNED',
        name: 'Assigned task',
        description: 'Work assigned by a manager or team lead.',
        departmentId: null,
        positionId: null,
        gradeId: null,
        requiresTime: false,
        requiresOutcome: false,
        requiresEvidence: false,
        requiresLocation: false,
        isFieldActivity: false,
        defaultKpiCode: null,
        displayOrder: 999,
        status: 'ACTIVE',
      }),
    );
  }

  async listForHr(actor: AuthenticatedUser, query: WorkActivityQueryDto) {
    return this.listScoped(actor, query, true);
  }

  async getOrCreateMyDailyReport(
    actor: AuthenticatedUser,
    activityDate: string,
    clientRequestId?: string,
    source: DailyActivitySourceEnum = DailyActivitySourceEnum.WEB,
  ) {
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);

    return this.dataSource.transaction(async (manager) => {
      if (clientRequestId) {
        const existingByRequest = await manager
          .getRepository(DailyActivityReport)
          .findOne({
            where: { companyId, employeeId, clientRequestId },
          });
        if (existingByRequest) {
          return this.getReportResponse(existingByRequest, manager);
        }
      }

      const existing = await manager
        .getRepository(DailyActivityReport)
        .findOne({
          where: { companyId, employeeId, activityDate },
        });

      if (existing) {
        return this.getReportResponse(existing, manager);
      }

      const employee = await manager.getRepository(Employee).findOne({
        where: { id: employeeId, company_id: companyId },
      });

      if (!employee) {
        throw new NotFoundException('Employee not found.');
      }

      const policy = await this.policyService.resolveForEmployee(
        companyId,
        employee,
        activityDate,
      );
      const managerCompanyUserId = await this.resolveManagerCompanyUserId(
        employee.reports_to,
      );

      const report = await manager.getRepository(DailyActivityReport).save(
        manager.getRepository(DailyActivityReport).create({
          companyId,
          employeeId,
          activityDate,
          status: DailyActivityReportStatusEnum.DRAFT,
          managerEmployeeId: employee.reports_to ?? null,
          managerCompanyUserId,
          employeeSnapshot: await this.buildEmployeeSnapshot(employee),
          policySnapshot: this.normalizePolicySnapshot(policy),
          attendanceSnapshot: null,
          clientRequestId: clientRequestId ?? null,
          source,
          metadata: null,
        }),
      );

      await this.auditService.log(
        {
          action: 'DAILY_ACTIVITY_REPORT_CREATED',
          actor,
          employeeId,
          entityType: 'DAILY_ACTIVITY_REPORT',
          entityId: report.id,
          afterValues: { activity_date: activityDate, source },
        },
        manager,
      );

      return this.getReportResponse(report, manager);
    });
  }

  async getMine(actor: AuthenticatedUser, id: number) {
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);
    const report = await this.reportRepository.findOne({
      where: { id, companyId, employeeId },
    });

    if (!report) {
      throw new NotFoundException('Daily activity report not found.');
    }

    return this.getReportResponse(report);
  }

  async addMyEntry(
    actor: AuthenticatedUser,
    reportId: number,
    dto: CreateDailyActivityEntryDto,
  ) {
    const report = await this.lockMyEditableReport(actor, reportId);
    const category = await this.policyService.getCategoryOrFail(
      report.companyId,
      dto.activity_category_id,
    );

    this.validateEntry(dto, category);
    await this.assertKpiLink(
      report.companyId,
      report.employeeId,
      dto.employee_kpi_id,
    );

    const existingByRequest =
      dto.client_request_id &&
      (await this.entryRepository.findOne({
        where: {
          companyId: report.companyId,
          dailyActivityReportId: report.id,
          clientRequestId: dto.client_request_id,
        },
      }));

    if (existingByRequest) {
      return this.getReportResponse(report);
    }

    await this.entryRepository.save(
      this.entryRepository.create({
        companyId: report.companyId,
        dailyActivityReportId: report.id,
        activityCategoryId: dto.activity_category_id,
        kpiDefinitionId: dto.kpi_definition_id ?? null,
        employeeKpiId: dto.employee_kpi_id ?? null,
        projectReference: dto.project_reference?.trim() ?? null,
        taskReference: dto.task_reference?.trim() ?? null,
        fieldPartyId: dto.field_party_id ?? null,
        externalReferenceType: dto.external_reference_type?.trim() ?? null,
        externalReferenceId: dto.external_reference_id?.trim() ?? null,
        title: dto.title.trim(),
        description: dto.description.trim(),
        expectedResult: dto.expected_result?.trim() ?? null,
        dueDate: dto.due_date ? new Date(dto.due_date) : null,
        completionDate:
          dto.status === DailyActivityStatusEnum.COMPLETED ? new Date() : null,
        plannedStartTime: dto.planned_start_time
          ? new Date(dto.planned_start_time)
          : new Date(`${report.activityDate}T09:00:00.000Z`),
        plannedEndTime: dto.planned_end_time
          ? new Date(dto.planned_end_time)
          : null,
        actualStartTime: dto.actual_start_time
          ? new Date(dto.actual_start_time)
          : null,
        actualEndTime: dto.actual_end_time
          ? new Date(dto.actual_end_time)
          : null,
        status: dto.status ?? DailyActivityStatusEnum.PLANNED,
        origin: DailyActivityOriginEnum.SELF_CREATED,
        reviewStatus: DailyActivityEntryReviewStatusEnum.NOT_REQUIRED,
        reviewedAt: null,
        reviewedByCompanyUserId: null,
        outcome: dto.outcome?.trim() ?? null,
        remarks: dto.remarks?.trim() ?? null,
        deferReason: dto.defer_reason?.trim() ?? null,
        followUpDate: dto.follow_up_date ?? null,
        completionPercentage: String(dto.completion_percentage ?? 0),
        managerComment: null,
        managerValidated: false,
        priority: dto.priority ?? DailyActivityPriorityEnum.MEDIUM,
        assignedByCompanyUserId: null,
        assignedByEmployeeId: null,
        assignedBySnapshot: null,
        checklist: (dto.checklist ?? []).map((item) => ({
          id: item.id,
          title: item.title.trim(),
          completed: item.completed === true,
        })),
        linkedFieldVisitId: null,
        clientRequestId: dto.client_request_id ?? null,
      }),
    );

    return this.getReportResponse(report);
  }

  async updateMyEntry(
    actor: AuthenticatedUser,
    reportId: number,
    entryId: number,
    dto: UpdateDailyActivityEntryDto,
  ) {
    const report = await this.lockMyEditableReport(actor, reportId);
    const entry = await this.entryRepository.findOne({
      where: {
        id: entryId,
        companyId: report.companyId,
        dailyActivityReportId: report.id,
      },
    });

    if (!entry) {
      throw new NotFoundException('Daily activity entry not found.');
    }
    const previousStatus = entry.status;

    const previousChecklist = Array.isArray(entry.checklist)
      ? entry.checklist.map((item) => ({ ...item }))
      : [];

    const category = await this.policyService.getCategoryOrFail(
      report.companyId,
      dto.activity_category_id ?? entry.activityCategoryId,
    );

    const merged = {
      ...entry,
      ...{
        activity_category_id:
          dto.activity_category_id ?? entry.activityCategoryId,
        planned_start_time:
          dto.planned_start_time ?? entry.plannedStartTime?.toISOString(),
        planned_end_time:
          dto.planned_end_time ?? entry.plannedEndTime?.toISOString(),
        status: dto.status ?? entry.status,
        outcome: dto.outcome ?? entry.outcome,
        defer_reason: dto.defer_reason ?? entry.deferReason,
        title: dto.title ?? entry.title,
        description: dto.description ?? entry.description,
        due_date: dto.due_date ?? entry.dueDate?.toISOString(),
        actual_start_time:
          dto.actual_start_time ?? entry.actualStartTime?.toISOString(),
        actual_end_time:
          dto.actual_end_time ?? entry.actualEndTime?.toISOString(),
        checklist: dto.checklist ?? entry.checklist,
        completion_percentage:
          dto.completion_percentage ?? Number(entry.completionPercentage),
      },
    } as unknown as CreateDailyActivityEntryDto;

    this.validateEntry(merged, category);
    assertDateRange(
      report.activityDate,
      merged.due_date?.slice(0, 10),
      'Activity',
    );
    if (dto.employee_kpi_id !== undefined) {
      await this.assertKpiLink(
        report.companyId,
        report.employeeId,
        dto.employee_kpi_id,
      );
    }

    if (dto.activity_category_id !== undefined) {
      entry.activityCategoryId = dto.activity_category_id;
    }
    if (dto.kpi_definition_id !== undefined) {
      entry.kpiDefinitionId = dto.kpi_definition_id ?? null;
    }
    if (dto.employee_kpi_id !== undefined) {
      entry.employeeKpiId = dto.employee_kpi_id ?? null;
    }
    if (dto.project_reference !== undefined) {
      entry.projectReference = dto.project_reference?.trim() ?? null;
    }
    if (dto.task_reference !== undefined) {
      entry.taskReference = dto.task_reference?.trim() ?? null;
    }
    if (dto.field_party_id !== undefined) {
      entry.fieldPartyId = dto.field_party_id ?? null;
    }
    if (dto.external_reference_type !== undefined) {
      entry.externalReferenceType = dto.external_reference_type?.trim() ?? null;
    }
    if (dto.external_reference_id !== undefined) {
      entry.externalReferenceId = dto.external_reference_id?.trim() ?? null;
    }
    if (dto.title !== undefined) {
      entry.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      entry.description = dto.description.trim();
    }
    if (dto.expected_result !== undefined) {
      entry.expectedResult = dto.expected_result?.trim() ?? null;
    }
    if (dto.due_date !== undefined) {
      entry.dueDate = dto.due_date ? new Date(dto.due_date) : null;
    }
    if (dto.planned_start_time !== undefined) {
      entry.plannedStartTime = dto.planned_start_time
        ? new Date(dto.planned_start_time)
        : null;
    }
    if (dto.planned_end_time !== undefined) {
      entry.plannedEndTime = dto.planned_end_time
        ? new Date(dto.planned_end_time)
        : null;
    }
    if (dto.actual_start_time !== undefined) {
      entry.actualStartTime = dto.actual_start_time
        ? new Date(dto.actual_start_time)
        : null;
    }
    if (dto.actual_end_time !== undefined) {
      entry.actualEndTime = dto.actual_end_time
        ? new Date(dto.actual_end_time)
        : null;
    }
    if (dto.status !== undefined) {
      entry.status = dto.status;
      if (dto.status === DailyActivityStatusEnum.COMPLETED) {
        entry.completionDate ??= new Date();
      } else {
        entry.completionDate = null;
        entry.reviewStatus = DailyActivityEntryReviewStatusEnum.NOT_REQUIRED;
        entry.managerValidated = false;
      }
    }
    if (dto.outcome !== undefined) {
      entry.outcome = dto.outcome?.trim() ?? null;
    }
    if (dto.remarks !== undefined) {
      entry.remarks = dto.remarks?.trim() ?? null;
    }
    if (dto.defer_reason !== undefined) {
      entry.deferReason = dto.defer_reason?.trim() ?? null;
    }
    if (dto.follow_up_date !== undefined) {
      entry.followUpDate = dto.follow_up_date ?? null;
    }
    if (dto.completion_percentage !== undefined) {
      entry.completionPercentage = String(dto.completion_percentage);
    }
    if (dto.priority !== undefined) {
      entry.priority = dto.priority;
    }
    if (dto.checklist !== undefined) {
      entry.checklist = dto.checklist.map((item) => ({
        id: item.id,
        title: item.title.trim(),
        completed: item.completed === true,
      }));
    }

    await this.entryRepository.save(entry);

    if (
      previousStatus !== DailyActivityStatusEnum.COMPLETED &&
      entry.status === DailyActivityStatusEnum.COMPLETED
    ) {
      await this.auditService.log({
        action: 'DAILY_ACTIVITY_COMPLETED',
        actor,
        employeeId: report.employeeId,
        entityType: 'DAILY_ACTIVITY_ENTRY',
        entityId: entry.id,
        beforeValues: { status: previousStatus },
        afterValues: {
          status: entry.status,
          completion_date: entry.completionDate,
          outcome: entry.outcome,
        },
      });
    }

    if (
      dto.checklist !== undefined &&
      entry.taskReference === 'MANAGER_ASSIGNED' &&
      JSON.stringify(previousChecklist) !== JSON.stringify(entry.checklist)
    ) {
      await this.notifyManagerOfChecklistUpdate(actor, report, entry);
    }

    return this.getReportResponse(report);
  }

  async updateManagerEntrySchedule(
    actor: AuthenticatedUser,
    entryId: number,
    dto: UpdateDailyActivityEntryDto,
  ) {
    const entry = await this.entryRepository.findOne({
      where: { id: entryId, companyId: this.getCompanyId(actor) },
    });
    if (!entry) {
      throw new NotFoundException('Daily activity entry not found.');
    }

    const report = await this.getManagerAccessibleReport(
      actor,
      entry.dailyActivityReportId,
    );
    await this.ensureEditableReport(report);
    if (
      !this.isManagerAssignedTaskRow(
        entry as unknown as Record<string, unknown>,
      )
    ) {
      throw new ForbiddenException(
        'Only manager-assigned work can be rescheduled here.',
      );
    }

    const start = dto.planned_start_time
      ? new Date(dto.planned_start_time)
      : entry.plannedStartTime;
    const end = dto.planned_end_time
      ? new Date(dto.planned_end_time)
      : entry.plannedEndTime;
    if (
      !start ||
      !end ||
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      throw new BadRequestException('Choose a valid start and end time.');
    }
    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('End time must be later than start time.');
    }

    entry.plannedStartTime = start;
    entry.plannedEndTime = end;
    await this.entryRepository.save(entry);

    await this.auditService.log({
      action: 'DAILY_ACTIVITY_RESCHEDULED',
      actor,
      employeeId: report.employeeId,
      entityType: 'DAILY_ACTIVITY_ENTRY',
      entityId: entry.id,
      afterValues: {
        planned_start_time: start,
        planned_end_time: end,
      },
    });

    return this.getReportResponse(report);
  }

  private async notifyManagerOfChecklistUpdate(
    actor: AuthenticatedUser,
    report: DailyActivityReport,
    entry: DailyActivityEntry,
  ): Promise<void> {
    const receiverCompanyUserId = entry.assignedByCompanyUserId;
    if (!receiverCompanyUserId) return;

    const employeeSnapshot: Record<string, unknown> =
      report.employeeSnapshot ?? {};
    const employeeName = this.toText(employeeSnapshot.full_name, 'An employee');
    const checklist = Array.isArray(entry.checklist) ? entry.checklist : [];
    const completedCount = checklist.filter(
      (item) => item.completed === true,
    ).length;
    const checklistSummary = checklist.length
      ? `${completedCount}/${checklist.length} checklist items complete`
      : 'the checklist';

    try {
      await this.notificationsService.createAndPush({
        company_id: report.companyId,
        sender_company_user_id: actor.companyMembershipId ?? null,
        receiver_company_user_id: receiverCompanyUserId,
        type: NotificationTypeEnum.GENERAL,
        category: NotificationCategoryEnum.GENERAL,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Task checklist updated',
        message: `${employeeName} updated the checklist for “${entry.title}” — ${checklistSummary}.`,
        related_module: 'activities',
        entity_type: 'DAILY_ACTIVITY_ENTRY',
        entity_id: entry.id,
        action_url: `/dashboard/activities/team?task=${entry.id}`,
        is_mandatory: true,
        metadata: {
          task_title: entry.title,
          employee_name: employeeName,
          task_id: entry.id,
          report_id: report.id,
          checklist,
          completed_count: completedCount,
          checklist_count: checklist.length,
        },
        channels: [NotificationChannelEnum.IN_APP],
        dedupe_key: `activities:task-checklist:${entry.id}:${entry.updatedAt?.getTime() ?? Date.now()}`,
      });
    } catch (error) {
      this.logger.warn(
        `Could not create in-app checklist notification for task ${entry.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async removeMyEntry(
    actor: AuthenticatedUser,
    reportId: number,
    entryId: number,
  ) {
    const report = await this.lockMyEditableReport(actor, reportId);
    const entry = await this.entryRepository.findOne({
      where: {
        id: entryId,
        companyId: report.companyId,
        dailyActivityReportId: report.id,
      },
    });

    if (!entry) {
      throw new NotFoundException('Daily activity entry not found.');
    }

    await this.evidenceRepository.delete({
      companyId: report.companyId,
      dailyActivityEntryId: entry.id,
    });
    await this.entryRepository.remove(entry);
    return this.getReportResponse(report);
  }

  async addMyEvidence(
    actor: AuthenticatedUser,
    entryId: number,
    dto: AddDailyActivityEvidenceDto,
  ) {
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);
    const entry = await this.entryRepository.findOne({
      where: { id: entryId, companyId },
    });

    if (!entry) {
      throw new NotFoundException('Daily activity entry not found.');
    }

    const report = await this.reportRepository.findOne({
      where: {
        id: entry.dailyActivityReportId,
        companyId,
        employeeId,
      },
    });

    if (!report) {
      throw new ForbiddenException('You cannot add evidence to this activity.');
    }

    await this.ensureEditableReport(report);

    const document = await this.dataSource.getRepository(Document).findOne({
      where: {
        id: dto.document_id,
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.EMPLOYEE,
        entity_id: employeeId,
      },
    });
    if (!document)
      throw new NotFoundException(
        'Choose an existing document from your own employee documents.',
      );

    await this.evidenceRepository.save(
      this.evidenceRepository.create({
        companyId,
        dailyActivityEntryId: entry.id,
        documentId: dto.document_id,
        description: dto.description?.trim() ?? null,
        submittedByCompanyUserId: actor.companyMembershipId ?? null,
      }),
    );

    return this.getReportResponse(report);
  }

  async addMyComment(
    actor: AuthenticatedUser,
    entryId: number,
    dto: CreateDailyActivityCommentDto,
  ) {
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);
    const entry = await this.entryRepository.findOne({
      where: { id: entryId, companyId },
    });
    if (!entry) throw new NotFoundException('Daily activity entry not found.');
    const report = await this.reportRepository.findOne({
      where: { id: entry.dailyActivityReportId, companyId, employeeId },
    });
    if (!report)
      throw new ForbiddenException('You cannot comment on this activity.');
    await this.commentRepository.save(
      this.commentRepository.create({
        companyId,
        dailyActivityEntryId: entry.id,
        authorCompanyUserId: actor.companyMembershipId ?? actor.id ?? null,
        authorEmployeeId: actor.employeeId ?? null,
        authorSnapshot: actor.employeeId
          ? await this.buildEmployeeSnapshot(
              await this.getEmployee(companyId, actor.employeeId),
            )
          : null,
        body: dto.body.trim(),
      }),
    );
    return this.getReportResponse(report);
  }

  async addManagerComment(
    actor: AuthenticatedUser,
    entryId: number,
    dto: CreateDailyActivityCommentDto,
  ) {
    const companyId = this.getCompanyId(actor);
    const entry = await this.entryRepository.findOne({
      where: { id: entryId, companyId },
    });
    if (!entry) throw new NotFoundException('Daily activity entry not found.');
    const report = await this.getManagerAccessibleReport(
      actor,
      entry.dailyActivityReportId,
    );
    await this.commentRepository.save(
      this.commentRepository.create({
        companyId,
        dailyActivityEntryId: entry.id,
        authorCompanyUserId: actor.companyMembershipId ?? actor.id ?? null,
        authorEmployeeId: actor.employeeId ?? null,
        authorSnapshot: actor.employeeId
          ? await this.buildEmployeeSnapshot(
              await this.getEmployee(companyId, actor.employeeId),
            )
          : null,
        body: dto.body.trim(),
      }),
    );
    return this.getReportResponse(report);
  }

  async submitMyDailyReport(
    actor: AuthenticatedUser,
    reportId: number,
    dto: SubmitDailyActivityReportDto,
  ) {
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);

    return this.dataSource.transaction(async (manager) => {
      const report = await manager.getRepository(DailyActivityReport).findOne({
        where: { id: reportId, companyId, employeeId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!report) {
        throw new NotFoundException('Daily activity report not found.');
      }

      if (
        ![
          DailyActivityReportStatusEnum.DRAFT,
          DailyActivityReportStatusEnum.RETURNED_FOR_CORRECTION,
        ].includes(report.status)
      ) {
        throw new ConflictException(
          'The daily activity report cannot be submitted in its current status.',
        );
      }

      let entries = await manager.getRepository(DailyActivityEntry).find({
        where: { companyId, dailyActivityReportId: report.id },
      });

      if (dto.entry_ids !== undefined) {
        entries = await this.keepSelectedEntries(
          manager,
          report,
          entries,
          dto.entry_ids,
        );
      }

      const policy = report.policySnapshot;
      const minimumCount = Number(policy.minimum_activity_count ?? 1);
      const minimumCompleted = Number(
        policy.minimum_completed_activity_count ?? 1,
      );

      if (entries.length < minimumCount) {
        throw new BadRequestException(
          `At least ${minimumCount} activities are required.`,
        );
      }

      const completed = entries.filter(
        (entry) => entry.status === DailyActivityStatusEnum.COMPLETED,
      );

      if (completed.length < minimumCompleted) {
        throw new BadRequestException(
          `At least ${minimumCompleted} completed activities are required.`,
        );
      }

      await this.assertRequiredEvidence(companyId, entries);

      const attendance = await this.attendanceRepository.findOne({
        where: {
          companyId,
          employeeId,
          attendanceDate: report.activityDate,
        },
      });

      const now = new Date();
      const cutoff = this.resolveCutoff(
        report.activityDate,
        this.toText(
          policy.submission_cutoff_time,
          this.configService.get<string>(
            'ACTIVITY_DEFAULT_CUTOFF_TIME',
            '20:00',
          ),
        ),
      );
      const delayMinutes =
        now > cutoff
          ? Math.ceil((now.getTime() - cutoff.getTime()) / 60000)
          : 0;

      report.employeeSummary = dto.employee_summary.trim();
      report.overallRemarks = dto.overall_remarks?.trim() ?? null;
      report.attendanceSnapshot = attendance
        ? {
            attendance_date: attendance.attendanceDate,
            status: attendance.attendanceStatus,
            check_in_at: attendance.checkInAt,
            check_out_at: attendance.checkOutAt,
            work_minutes: attendance.workMinutes,
          }
        : null;
      report.submittedAt = now;
      report.submissionIsLate = delayMinutes > 0;
      report.submissionDelayMinutes = delayMinutes;
      report.status =
        policy.manager_review_required === false
          ? DailyActivityReportStatusEnum.APPROVED
          : DailyActivityReportStatusEnum.MANAGER_REVIEW_PENDING;
      report.clientRequestId = dto.client_request_id;

      for (const entry of completed) {
        entry.completionDate ??= now;
        entry.reviewStatus =
          policy.manager_review_required === false
            ? DailyActivityEntryReviewStatusEnum.NOT_REQUIRED
            : DailyActivityEntryReviewStatusEnum.PENDING;
      }
      await manager.getRepository(DailyActivityEntry).save(completed);

      const saved = await manager
        .getRepository(DailyActivityReport)
        .save(report);

      if (
        saved.status === DailyActivityReportStatusEnum.MANAGER_REVIEW_PENDING
      ) {
        await this.createManagerActionItem(saved);
      }

      const employee = await this.getEmployee(companyId, employeeId);
      if (
        saved.status === DailyActivityReportStatusEnum.MANAGER_REVIEW_PENDING
      ) {
        void this.notifyManagerActivityCompleted(saved, employee, actor);
      }
      await this.exceptionService.reconcileForEmployeeDate(
        employee,
        saved.activityDate,
        {
          dailySubmissionRequired: true,
          fieldVisitPlanRequired: Boolean(
            saved.policySnapshot.field_visit_plan_required,
          ),
        },
      );

      await this.auditService.log(
        {
          action: 'DAILY_ACTIVITY_REPORT_SUBMITTED',
          actor,
          employeeId,
          entityType: 'DAILY_ACTIVITY_REPORT',
          entityId: saved.id,
          afterValues: {
            status: saved.status,
            submission_is_late: saved.submissionIsLate,
            submission_delay_minutes: saved.submissionDelayMinutes,
          },
        },
        manager,
      );

      return this.getReportResponse(saved, manager);
    });
  }

  async listPendingReviews(
    actor: AuthenticatedUser,
    query: WorkActivityQueryDto,
  ) {
    const companyId = this.getCompanyId(actor);
    const employeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    if (employeeIds !== null && employeeIds.length === 0) {
      return { data: [], meta: { page, limit, total: 0, total_pages: 0 } };
    }

    const qb = this.reportRepository
      .createQueryBuilder('report')
      .where('report.companyId = :companyId', { companyId })
      .andWhere('report.status = :status', {
        status: DailyActivityReportStatusEnum.MANAGER_REVIEW_PENDING,
      })
      .orderBy('report.submittedAt', 'ASC', 'NULLS LAST')
      .addOrderBy('report.activityDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (employeeIds !== null) {
      qb.andWhere('report.employeeId IN (:...employeeIds)', { employeeIds });
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      data: await Promise.all(
        items.map((item) => this.getReportResponse(item)),
      ),
      meta: { page, limit, total, total_pages: Math.ceil(total / limit) },
    };
  }

  private async listScoped(
    actor: AuthenticatedUser,
    query: WorkActivityQueryDto,
    allowCompanyScope: boolean,
  ) {
    const companyId = this.getCompanyId(actor);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const employeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);

    if (
      !allowCompanyScope &&
      employeeIds !== null &&
      employeeIds.length === 0
    ) {
      return { data: [], meta: { page, limit, total: 0, total_pages: 0 } };
    }

    const qb = this.reportRepository
      .createQueryBuilder('report')
      .where('report.companyId = :companyId', { companyId })
      .orderBy('report.activityDate', 'DESC')
      .addOrderBy('report.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (employeeIds !== null) {
      if (employeeIds.length === 0) {
        return { data: [], meta: { page, limit, total: 0, total_pages: 0 } };
      }
      qb.andWhere('report.employeeId IN (:...employeeIds)', { employeeIds });
    }

    if (query.employee_id) {
      qb.andWhere('report.employeeId = :employeeId', {
        employeeId: query.employee_id,
      });
    }
    if (query.date_from) {
      qb.andWhere('report.activityDate >= :dateFrom', {
        dateFrom: query.date_from,
      });
    }
    if (query.date_to) {
      qb.andWhere('report.activityDate <= :dateTo', { dateTo: query.date_to });
    }
    if (query.status) {
      qb.andWhere('report.status = :status', { status: query.status });
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      data: await Promise.all(
        items.map((item) => this.getReportResponse(item)),
      ),
      meta: { page, limit, total, total_pages: Math.ceil(total / limit) },
    };
  }

  async getForManager(actor: AuthenticatedUser, id: number) {
    const report = await this.getManagerAccessibleReport(actor, id);
    return this.getReportResponse(report);
  }

  private async assertKpiLink(
    companyId: number,
    employeeId: number,
    employeeKpiId?: number,
  ): Promise<void> {
    if (employeeKpiId === undefined) return;
    const kpi = await this.employeeKpiRepository.findOne({
      where: {
        id: employeeKpiId,
        companyId,
        employeeId,
        status: EmployeeKpiStatusEnum.APPROVED,
      },
      relations: { performancePeriod: true },
    });
    if (!kpi) {
      throw new BadRequestException(
        'Activities can only be linked to an approved KPI owned by the assignee.',
      );
    }
    if (
      [
        PerformancePeriodStatusEnum.LOCKED,
        PerformancePeriodStatusEnum.CANCELLED,
      ].includes(kpi.performancePeriod.status)
    ) {
      throw new ConflictException('The KPI performance period is closed.');
    }
  }

  async reviewDailyActivity(
    actor: AuthenticatedUser,
    reportId: number,
    dto: ReviewDailyActivityReportDto,
  ) {
    if (!dto.comments?.trim())
      throw new BadRequestException(
        'Explain the activity review decision before submitting.',
      );
    if (
      dto.rating !== undefined &&
      (!Number.isFinite(Number(dto.rating)) ||
        Number(dto.rating) < 0 ||
        Number(dto.rating) > 100)
    )
      throw new BadRequestException(
        'Activity review rating must be between 0 and 100.',
      );
    return this.dataSource.transaction(async (manager) => {
      const report = await manager.getRepository(DailyActivityReport).findOne({
        where: { id: reportId, companyId: this.getCompanyId(actor) },
        lock: { mode: 'pessimistic_write' },
      });

      if (!report) {
        throw new NotFoundException('Daily activity report not found.');
      }

      await this.assertManagerCanReview(
        actor,
        report.employeeId,
        report.managerEmployeeId,
      );

      if (
        report.status !== DailyActivityReportStatusEnum.MANAGER_REVIEW_PENDING
      ) {
        throw new ConflictException(
          'The report is not awaiting manager review.',
        );
      }

      for (const entryReview of dto.entry_reviews ?? []) {
        const entry = await manager.getRepository(DailyActivityEntry).findOne({
          where: {
            id: entryReview.entry_id,
            companyId: report.companyId,
            dailyActivityReportId: report.id,
          },
        });
        if (!entry) continue;
        entry.managerComment = entryReview.manager_comment?.trim() ?? null;
        if (entryReview.manager_validated !== undefined) {
          entry.managerValidated = entryReview.manager_validated;
        }
        await manager.getRepository(DailyActivityEntry).save(entry);
      }

      report.managerComments = dto.comments.trim();
      report.managerRating = dto.rating ?? null;
      report.reviewedAt = new Date();
      report.reviewedByCompanyUserId = actor.companyMembershipId ?? null;

      switch (dto.decision) {
        case DailyActivityReviewDecisionEnum.APPROVE:
          report.status = DailyActivityReportStatusEnum.APPROVED;
          break;
        case DailyActivityReviewDecisionEnum.RETURN:
          report.status = DailyActivityReportStatusEnum.RETURNED_FOR_CORRECTION;
          break;
        case DailyActivityReviewDecisionEnum.REJECT:
          report.status = DailyActivityReportStatusEnum.REJECTED;
          break;
      }

      const reportEntries = await manager
        .getRepository(DailyActivityEntry)
        .find({
          where: {
            companyId: report.companyId,
            dailyActivityReportId: report.id,
          },
        });
      for (const entry of reportEntries) {
        if (entry.status !== DailyActivityStatusEnum.COMPLETED) continue;
        entry.reviewedAt = report.reviewedAt;
        entry.reviewedByCompanyUserId = actor.companyMembershipId ?? null;
        switch (dto.decision) {
          case DailyActivityReviewDecisionEnum.APPROVE:
            entry.reviewStatus = DailyActivityEntryReviewStatusEnum.APPROVED;
            entry.managerValidated = true;
            break;
          case DailyActivityReviewDecisionEnum.RETURN:
            entry.reviewStatus = DailyActivityEntryReviewStatusEnum.RETURNED;
            entry.managerValidated = false;
            break;
          case DailyActivityReviewDecisionEnum.REJECT:
            entry.reviewStatus = DailyActivityEntryReviewStatusEnum.REJECTED;
            entry.managerValidated = false;
            break;
        }
      }
      await manager.getRepository(DailyActivityEntry).save(reportEntries);

      const saved = await manager
        .getRepository(DailyActivityReport)
        .save(report);
      await this.actionItemsService.completeAllOpenForEntity(
        saved.companyId,
        'WORK_ACTIVITIES',
        'DAILY_ACTIVITY_REPORT',
        saved.id,
      );

      const employee = await this.getEmployee(
        saved.companyId,
        saved.employeeId,
      );
      await this.exceptionService.reconcileForEmployeeDate(
        employee,
        saved.activityDate,
        {
          dailySubmissionRequired: true,
          fieldVisitPlanRequired: Boolean(
            saved.policySnapshot.field_visit_plan_required,
          ),
        },
      );

      await this.auditService.log(
        {
          action: 'DAILY_ACTIVITY_REPORT_REVIEWED',
          actor,
          employeeId: saved.employeeId,
          entityType: 'DAILY_ACTIVITY_REPORT',
          entityId: saved.id,
          afterValues: {
            status: saved.status,
            manager_comments: saved.managerComments,
          },
        },
        manager,
      );

      void this.notifyEmployeeActivityReviewed(saved, employee, actor);

      return this.getReportResponse(saved, manager);
    });
  }

  private async getManagerAccessibleReport(
    actor: AuthenticatedUser,
    id: number,
  ) {
    const report = await this.reportRepository.findOne({
      where: { id, companyId: this.getCompanyId(actor) },
    });

    if (!report) {
      throw new NotFoundException('Daily activity report not found.');
    }

    await this.assertManagerCanReview(
      actor,
      report.employeeId,
      report.managerEmployeeId,
    );
    return report;
  }

  private async assertManagerCanAssign(
    actor: AuthenticatedUser,
    employee: Employee,
  ) {
    if (employee.company_id !== this.getCompanyId(actor)) {
      throw new ForbiddenException(
        'You can only assign work to employees in your company.',
      );
    }
    if (employee.employment_status !== EmploymentStatusEnum.ACTIVE) {
      throw new BadRequestException(
        'Only active employees can be assigned work.',
      );
    }

    const accessibleEmployeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);
    if (
      accessibleEmployeeIds !== null &&
      !accessibleEmployeeIds.includes(employee.id)
    ) {
      throw new ForbiddenException(
        'You can only assign work within your reporting scope.',
      );
    }
  }

  private async assertManagerCanReview(
    actor: AuthenticatedUser,
    employeeId: number,
    managerEmployeeId: number | null,
  ) {
    if (
      actor.employeeId &&
      managerEmployeeId &&
      actor.employeeId === managerEmployeeId
    ) {
      return;
    }

    const accessibleEmployeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);
    if (
      accessibleEmployeeIds === null ||
      accessibleEmployeeIds.includes(employeeId)
    ) {
      return;
    }

    throw new ForbiddenException('You are not allowed to review this report.');
  }

  private async lockMyEditableReport(
    actor: AuthenticatedUser,
    reportId: number,
  ) {
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);
    const report = await this.reportRepository.findOne({
      where: { id: reportId, companyId, employeeId },
    });

    if (!report) {
      throw new NotFoundException('Daily activity report not found.');
    }

    await this.ensureEditableReport(report);
    return report;
  }

  private ensureEditableReport(report: DailyActivityReport): Promise<void> {
    if (
      ![
        DailyActivityReportStatusEnum.DRAFT,
        DailyActivityReportStatusEnum.RETURNED_FOR_CORRECTION,
      ].includes(report.status)
    ) {
      throw new ConflictException(
        'Only draft or returned reports can be edited.',
      );
    }

    return Promise.resolve();
  }

  private validateEntry(
    entry: CreateDailyActivityEntryDto,
    category: ActivityCategory,
  ) {
    if (
      category.requiresTime &&
      (!entry.planned_start_time || !entry.planned_end_time)
    ) {
      throw new BadRequestException(
        'Start time and end time are required for this activity category.',
      );
    }

    if (!entry.title?.trim() || !entry.description?.trim()) {
      throw new BadRequestException(
        'Activity title and description cannot be blank.',
      );
    }
    for (const [start, end, label] of [
      [entry.planned_start_time, entry.planned_end_time, 'Planned'],
      [entry.actual_start_time, entry.actual_end_time, 'Actual'],
    ] as const) {
      if (end && !start)
        throw new BadRequestException(
          `${label} end time requires a start time.`,
        );
      if (
        (start && Number.isNaN(Date.parse(start))) ||
        (end && Number.isNaN(Date.parse(end)))
      ) {
        throw new BadRequestException(
          `${label} activity times must be valid timestamps.`,
        );
      }
      if (start && end && Date.parse(end) <= Date.parse(start)) {
        throw new BadRequestException(
          `${label} end time must be later than start time.`,
        );
      }
    }
    if (
      entry.completion_percentage !== undefined &&
      (!Number.isFinite(entry.completion_percentage) ||
        entry.completion_percentage < 0 ||
        entry.completion_percentage > 100)
    ) {
      throw new BadRequestException(
        'Activity completion percentage must be between 0 and 100.',
      );
    }
    if (entry.checklist) {
      if (
        entry.checklist.length > 100 ||
        entry.checklist.some(
          (item) =>
            !item.id?.trim() || !item.title?.trim() || item.title.length > 250,
        )
      ) {
        throw new BadRequestException(
          'A checklist can have at most 100 items, each with a nonblank ID and title of at most 250 characters.',
        );
      }
      assertUniqueValues(
        entry.checklist.map((item) => item.id),
        'Activity checklist IDs',
      );
    }

    if (
      (entry.status ?? DailyActivityStatusEnum.PLANNED) ===
        DailyActivityStatusEnum.COMPLETED &&
      category.requiresOutcome &&
      !entry.outcome?.trim()
    ) {
      throw new BadRequestException(
        'An outcome is required for a completed activity.',
      );
    }

    if (
      (entry.status ?? DailyActivityStatusEnum.PLANNED) ===
        DailyActivityStatusEnum.DEFERRED &&
      !entry.defer_reason?.trim()
    ) {
      throw new BadRequestException('A defer reason is required.');
    }
  }

  private async assertRequiredEvidence(
    companyId: number,
    entries: DailyActivityEntry[],
  ) {
    const categoryIds = [
      ...new Set(entries.map((entry) => entry.activityCategoryId)),
    ];
    const categories = await this.categoryRepository.find({
      where: categoryIds.map((id) => ({ companyId, id })),
    });
    const categoryMap = new Map(
      categories.map((category) => [category.id, category]),
    );

    for (const entry of entries) {
      const category = categoryMap.get(entry.activityCategoryId);
      if (!category?.requiresEvidence) {
        continue;
      }

      const evidenceCount = await this.evidenceRepository.count({
        where: { companyId, dailyActivityEntryId: entry.id },
      });
      if (evidenceCount === 0) {
        throw new BadRequestException(
          `Evidence is required for activity '${entry.title}'.`,
        );
      }
    }
  }

  private resolveCutoff(activityDate: string, cutoffTime: string) {
    return new Date(`${activityDate}T${cutoffTime}:00.000Z`);
  }

  private async employeePhotoUrl(employee: Employee) {
    const resolved =
      await this.defaultAvatarsService.resolveEmployeeProfileAvatar(
        employee.company_id,
        employee,
      );
    return resolved.profile_photo_url;
  }

  private async buildEmployeeSnapshot(employee: Employee) {
    return {
      employee_id: employee.id,
      employee_no: employee.employee_no,
      full_name: [employee.first_name, employee.middle_name, employee.last_name]
        .filter(Boolean)
        .join(' '),
      profile_photo_url: await this.employeePhotoUrl(employee),
      branch_id: employee.primary_branch_id,
      department_id: employee.primary_department_id,
      position_id: employee.primary_position_id,
      grade_id: employee.grade_id,
      employment_type: employee.employment_type,
    };
  }

  private async resolveManagerCompanyUserId(managerEmployeeId: number | null) {
    if (!managerEmployeeId) {
      return null;
    }

    const manager = await this.employeeRepository.findOne({
      where: { id: managerEmployeeId },
      select: ['id', 'company_user_id'],
    });

    return manager?.company_user_id ?? null;
  }

  private normalizePolicySnapshot(policy: Record<string, unknown> | object) {
    const policyRecord = policy as Record<string, unknown>;
    return {
      minimum_activity_count: Number(policyRecord.minimumActivityCount ?? 1),
      minimum_completed_activity_count: Number(
        policyRecord.minimumCompletedActivityCount ?? 1,
      ),
      manager_review_required: policyRecord.managerReviewRequired !== false,
      submission_cutoff_time: this.toText(
        policyRecord.submissionCutoffTime,
        '20:00',
      ),
      daily_submission_required: policyRecord.dailySubmissionRequired !== false,
      field_visit_plan_required: Boolean(
        policyRecord.fieldVisitPlanRequired ?? false,
      ),
      allow_unplanned_visits: policyRecord.allowUnplannedVisits !== false,
      require_visit_selfie: Boolean(policyRecord.requireVisitSelfie ?? false),
      require_device_binding: policyRecord.requireDeviceBinding !== false,
      maximum_backdate_days: Number(policyRecord.maximumBackdateDays ?? 0),
    };
  }

  private async createManagerActionItem(report: DailyActivityReport) {
    if (!report.managerCompanyUserId) {
      return;
    }

    await this.actionItemsService.upsertOpen({
      companyId: report.companyId,
      assigneeCompanyUserId: report.managerCompanyUserId,
      assigneeEmployeeId: report.managerEmployeeId ?? null,
      actionType: ActionItemTypeEnum.APPROVAL,
      sourceModule: 'WORK_ACTIVITIES',
      sourceEntityType: 'DAILY_ACTIVITY_REPORT',
      sourceEntityId: report.id,
      sourceKey: `daily-activity-review:${report.id}`,
      title: 'Review daily activity report',
      description: `Daily activity report for ${report.activityDate} is awaiting review.`,
      actionUrl: `/manager/activities/reports/${report.id}`,
      metadata: {
        employee_id: report.employeeId,
        activity_date: report.activityDate,
      },
    });
  }

  private async notifyManagerActivityCompleted(
    report: DailyActivityReport,
    employee: Employee,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (!report.managerCompanyUserId) return;
    try {
      await this.notificationsService.createAndPush({
        company_id: report.companyId,
        sender_company_user_id: actor.companyMembershipId ?? null,
        receiver_company_user_id: report.managerCompanyUserId,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Activities awaiting review',
        message: `${employee.first_name} ${employee.last_name} submitted activities for ${report.activityDate}.`,
        related_module: 'WORK_ACTIVITIES',
        entity_type: 'DAILY_ACTIVITY_REPORT',
        entity_id: report.id,
        action_url: `/dashboard/activities/reviews?report=${report.id}`,
        dedupe_key: `daily-activity-submitted:${report.id}:${report.version}`,
      });
    } catch (error) {
      this.logger.warn(
        `Activity report ${report.id} was submitted, but notification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async notifyEmployeeActivityReviewed(
    report: DailyActivityReport,
    employee: Employee,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (!employee.company_user_id) return;
    try {
      await this.notificationsService.createAndPush({
        company_id: report.companyId,
        sender_company_user_id: actor.companyMembershipId ?? null,
        receiver_company_user_id: employee.company_user_id,
        category: NotificationCategoryEnum.HR,
        priority:
          report.status === DailyActivityReportStatusEnum.APPROVED
            ? NotificationPriorityEnum.MEDIUM
            : NotificationPriorityEnum.HIGH,
        title: `Activity report ${report.status.toLowerCase().replaceAll('_', ' ')}`,
        message:
          report.managerComments ??
          `Your activities for ${report.activityDate} were reviewed.`,
        related_module: 'WORK_ACTIVITIES',
        entity_type: 'DAILY_ACTIVITY_REPORT',
        entity_id: report.id,
        action_url: `/dashboard/me/activities/reports?report=${report.id}`,
        dedupe_key: `daily-activity-reviewed:${report.id}:${report.version}`,
      });
    } catch (error) {
      this.logger.warn(
        `Activity report ${report.id} was reviewed, but notification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async getReportResponse(
    report: DailyActivityReport,
    manager: EntityManager = this.dataSource.manager,
  ) {
    const entryRepository = manager.getRepository(DailyActivityEntry);
    const evidenceRepository = manager.getRepository(DailyActivityEvidence);
    const commentRepository = manager.getRepository(DailyActivityComment);

    const entries = await entryRepository.find({
      where: { companyId: report.companyId, dailyActivityReportId: report.id },
      order: { id: 'ASC' },
    });

    const evidence = entries.length
      ? await evidenceRepository.find({
          where: entries.map((entry) => ({
            companyId: report.companyId,
            dailyActivityEntryId: entry.id,
          })),
        })
      : [];

    const evidenceByEntryId = new Map<number, DailyActivityEvidence[]>();
    for (const item of evidence) {
      const bucket = evidenceByEntryId.get(item.dailyActivityEntryId) ?? [];
      bucket.push(item);
      evidenceByEntryId.set(item.dailyActivityEntryId, bucket);
    }

    const comments = entries.length
      ? await commentRepository.find({
          where: entries.map((entry) => ({
            companyId: report.companyId,
            dailyActivityEntryId: entry.id,
          })),
          order: { createdAt: 'ASC' },
        })
      : [];
    const commentsByEntryId = new Map<number, DailyActivityComment[]>();
    for (const item of comments) {
      const bucket = commentsByEntryId.get(item.dailyActivityEntryId) ?? [];
      bucket.push(item);
      commentsByEntryId.set(item.dailyActivityEntryId, bucket);
    }

    return {
      ...report,
      entries: entries.map((entry) => ({
        ...entry,
        evidence: evidenceByEntryId.get(entry.id) ?? [],
        comments: commentsByEntryId.get(entry.id) ?? [],
      })),
    };
  }
}
