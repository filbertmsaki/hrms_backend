import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ActionItemTypeEnum } from '../../action-inbox/enums/action-item-type.enum';
import { ActionItemsService } from '../../action-inbox/action-items.service';
import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  AddDailyActivityEvidenceDto,
  CreateDailyActivityEntryDto,
  CreateManagerActivityTaskDto,
  UpdateDailyActivityEntryDto,
  SubmitDailyActivityReportDto,
  ReviewDailyActivityReportDto,
} from '../dto/activity.dto';
import { WorkActivityQueryDto } from '../dto/queries.dto';
import { ActivityCategory } from '../entities/activity-config.entities';
import {
  DailyActivityEntry,
  DailyActivityEvidence,
  DailyActivityReport,
} from '../entities/daily-activity.entities';
import {
  DailyActivityReportStatusEnum,
  DailyActivityReviewDecisionEnum,
  DailyActivitySourceEnum,
  DailyActivityStatusEnum,
} from '../enums/work-activity.enums';
import { ActivityPolicyService } from './activity-policy.service';
import { WorkActivityAuditService } from './work-activity-audit.service';
import { WorkActivityExceptionService } from './work-activity-exception.service';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';

@Injectable()
export class DailyActivityService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly actionItemsService: ActionItemsService,
    private readonly policyService: ActivityPolicyService,
    private readonly auditService: WorkActivityAuditService,
    private readonly exceptionService: WorkActivityExceptionService,
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
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceRepository: Repository<AttendanceDailySummary>,
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

  async createManagerTask(
    actor: AuthenticatedUser,
    dto: CreateManagerActivityTaskDto,
  ) {
    const companyId = this.getCompanyId(actor);
    const employee = await this.getEmployee(companyId, dto.employee_id);
    await this.assertManagerCanReview(
      actor,
      employee.id,
      employee.reports_to ?? null,
    );
    const category = await this.policyService.getCategoryOrFail(
      companyId,
      dto.activity_category_id,
    );
    const entryDto: CreateDailyActivityEntryDto = {
      activity_category_id: dto.activity_category_id,
      title: dto.title,
      description: dto.description,
      planned_start_time: dto.planned_start_time,
      planned_end_time: dto.planned_end_time,
      task_reference: 'MANAGER_ASSIGNED',
      status: DailyActivityStatusEnum.PLANNED,
    };
    this.validateEntry(entryDto, category);

    return this.dataSource.transaction(async (manager) => {
      let report = await manager.getRepository(DailyActivityReport).findOne({
        where: {
          companyId,
          employeeId: employee.id,
          activityDate: dto.activity_date,
        },
      });
      if (!report) {
        const policy = await this.policyService.resolveForEmployee(
          companyId,
          employee,
          dto.activity_date,
        );
        report = await manager.getRepository(DailyActivityReport).save(
          manager.getRepository(DailyActivityReport).create({
            companyId,
            employeeId: employee.id,
            activityDate: dto.activity_date,
            status: DailyActivityReportStatusEnum.DRAFT,
            managerEmployeeId: employee.reports_to ?? null,
            managerCompanyUserId: await this.resolveManagerCompanyUserId(
              employee.reports_to,
            ),
            employeeSnapshot: this.buildEmployeeSnapshot(employee),
            policySnapshot: this.normalizePolicySnapshot(policy),
            attendanceSnapshot: null,
            clientRequestId: null,
            source: DailyActivitySourceEnum.SYSTEM,
            metadata: { manager_assigned_task: true },
          }),
        );
      }
      if (
        ![
          DailyActivityReportStatusEnum.DRAFT,
          DailyActivityReportStatusEnum.RETURNED_FOR_CORRECTION,
        ].includes(report.status)
      ) {
        throw new ConflictException(
          'The selected employee report is already submitted and cannot receive a new task for this date.',
        );
      }
      await manager.getRepository(DailyActivityEntry).save(
        manager.getRepository(DailyActivityEntry).create({
          companyId,
          dailyActivityReportId: report.id,
          activityCategoryId: dto.activity_category_id,
          kpiDefinitionId: null,
          projectReference: null,
          taskReference: 'MANAGER_ASSIGNED',
          fieldPartyId: null,
          externalReferenceType: 'MANAGER_TASK',
          externalReferenceId: String(actor.id),
          title: dto.title.trim(),
          description: dto.description.trim(),
          plannedStartTime: dto.planned_start_time
            ? new Date(dto.planned_start_time)
            : null,
          plannedEndTime: dto.planned_end_time
            ? new Date(dto.planned_end_time)
            : null,
          actualStartTime: null,
          actualEndTime: null,
          status: DailyActivityStatusEnum.PLANNED,
          outcome: null,
          remarks: null,
          deferReason: null,
          followUpDate: null,
          completionPercentage: '0',
          managerComment: null,
          managerValidated: false,
          linkedFieldVisitId: null,
          clientRequestId: null,
        }),
      );
      return this.getReportResponse(report, manager);
    });
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
          employeeSnapshot: this.buildEmployeeSnapshot(employee),
          policySnapshot: this.normalizePolicySnapshot(policy),
          attendanceSnapshot: null,
          clientRequestId: clientRequestId ?? null,
          source,
          metadata: null,
        }),
      );

      await this.auditService.log({
        action: 'DAILY_ACTIVITY_REPORT_CREATED',
        actor,
        employeeId,
        entityType: 'DAILY_ACTIVITY_REPORT',
        entityId: report.id,
        afterValues: { activity_date: activityDate, source },
      });

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
        projectReference: dto.project_reference?.trim() ?? null,
        taskReference: dto.task_reference?.trim() ?? null,
        fieldPartyId: dto.field_party_id ?? null,
        externalReferenceType: dto.external_reference_type?.trim() ?? null,
        externalReferenceId: dto.external_reference_id?.trim() ?? null,
        title: dto.title.trim(),
        description: dto.description.trim(),
        plannedStartTime: dto.planned_start_time
          ? new Date(dto.planned_start_time)
          : null,
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
        outcome: dto.outcome?.trim() ?? null,
        remarks: dto.remarks?.trim() ?? null,
        deferReason: dto.defer_reason?.trim() ?? null,
        followUpDate: dto.follow_up_date ?? null,
        completionPercentage: String(dto.completion_percentage ?? 0),
        managerComment: null,
        managerValidated: false,
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
      },
    } as CreateDailyActivityEntryDto;

    this.validateEntry(merged, category);

    if (dto.activity_category_id !== undefined) {
      entry.activityCategoryId = dto.activity_category_id;
    }
    if (dto.kpi_definition_id !== undefined) {
      entry.kpiDefinitionId = dto.kpi_definition_id ?? null;
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

    await this.entryRepository.save(entry);
    return this.getReportResponse(report);
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

      const entries = await manager.getRepository(DailyActivityEntry).find({
        where: { companyId, dailyActivityReportId: report.id },
      });

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

      const saved = await manager
        .getRepository(DailyActivityReport)
        .save(report);

      if (
        saved.status === DailyActivityReportStatusEnum.MANAGER_REVIEW_PENDING
      ) {
        await this.createManagerActionItem(saved);
      }

      const employee = await this.getEmployee(companyId, employeeId);
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

      await this.auditService.log({
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
      });

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

  async reviewDailyActivity(
    actor: AuthenticatedUser,
    reportId: number,
    dto: ReviewDailyActivityReportDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const report = await manager.getRepository(DailyActivityReport).findOne({
        where: { id: reportId, companyId: this.getCompanyId(actor) },
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

      await this.auditService.log({
        action: 'DAILY_ACTIVITY_REPORT_REVIEWED',
        actor,
        employeeId: saved.employeeId,
        entityType: 'DAILY_ACTIVITY_REPORT',
        entityId: saved.id,
        afterValues: {
          status: saved.status,
          manager_comments: saved.managerComments,
        },
      });

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

    if (
      entry.planned_start_time &&
      entry.planned_end_time &&
      new Date(entry.planned_start_time) > new Date(entry.planned_end_time)
    ) {
      throw new BadRequestException(
        'Activity end time cannot be before start time.',
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

  private buildEmployeeSnapshot(employee: Employee) {
    return {
      employee_id: employee.id,
      employee_no: employee.employee_no,
      full_name: [employee.first_name, employee.middle_name, employee.last_name]
        .filter(Boolean)
        .join(' '),
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

  private async getReportResponse(
    report: DailyActivityReport,
    manager: EntityManager = this.dataSource.manager,
  ) {
    const entryRepository = manager.getRepository(DailyActivityEntry);
    const evidenceRepository = manager.getRepository(DailyActivityEvidence);

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

    return {
      ...report,
      entries: entries.map((entry) => ({
        ...entry,
        evidence: evidenceByEntryId.get(entry.id) ?? [],
      })),
    };
  }
}
