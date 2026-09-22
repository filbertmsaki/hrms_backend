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
import Decimal from 'decimal.js';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { NotificationsService } from '../../../notifications/notifications.service';
import { NotificationCategoryEnum } from '../../../notifications/enums/notification-category.enum';
import { NotificationPriorityEnum } from '../../../notifications/enums/notification-priority.enum';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  CreateEmployeeKpiDto,
  EmployeeKpiQueryDto,
  ReviewEmployeeKpiDto,
  UpdateEmployeeKpiActualDto,
  UpdateEmployeeKpiDto,
} from '../dto/employee-kpi.dto';
import {
  EmployeeKpi,
  EmployeeKpiReviewHistory,
} from '../entities/employee-kpi.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import {
  EmployeeKpiReviewDecisionEnum,
  EmployeeKpiStatusEnum,
} from '../enums/employee-kpi-status.enum';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { PerformancePeriodStatusEnum } from '../enums/performance-period-status.enum';
import { PerformanceAuditService } from './performance-audit.service';
import { EmployeeKpiProgressService } from './employee-kpi-progress.service';

const EDITABLE_STATUSES = [
  EmployeeKpiStatusEnum.DRAFT,
  EmployeeKpiStatusEnum.RETURNED,
];
const REVIEWABLE_STATUSES = [
  EmployeeKpiStatusEnum.SUBMITTED,
  EmployeeKpiStatusEnum.RESUBMITTED,
  EmployeeKpiStatusEnum.PENDING_REVIEW,
];
const CLOSED_PERIOD_STATUSES = [
  PerformancePeriodStatusEnum.LOCKED,
  PerformancePeriodStatusEnum.CANCELLED,
];

@Injectable()
export class EmployeeKpiService {
  private readonly logger = new Logger(EmployeeKpiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PerformanceAuditService,
    private readonly progressService: EmployeeKpiProgressService,
    private readonly notificationsService: NotificationsService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(EmployeeKpi)
    private readonly kpiRepository: Repository<EmployeeKpi>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(PerformancePeriod)
    private readonly periodRepository: Repository<PerformancePeriod>,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreateEmployeeKpiDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employeeId = this.requireEmployee(actor);
    const employee = await this.getEmployee(companyId, employeeId);
    const period = await this.getOpenPeriod(
      companyId,
      dto.performance_period_id,
    );
    this.validateKpiDates(period, dto.start_date, dto.due_date);
    this.validateMeasurement(dto.measurement_type, dto.target_value);

    const kpi = await this.kpiRepository.save(
      this.kpiRepository.create({
        companyId,
        performancePeriodId: period.id,
        employeeId,
        createdByCompanyUserId: actor.companyMembershipId ?? null,
        title: dto.title.trim(),
        description: dto.description.trim(),
        measurementType: dto.measurement_type,
        targetValue:
          dto.target_value === undefined ? null : String(dto.target_value),
        actualValue: null,
        unit: dto.unit?.trim() ?? null,
        weight: String(dto.weight),
        startDate: dto.start_date ?? null,
        dueDate: dto.due_date,
        progressSource: dto.progress_source,
        status: EmployeeKpiStatusEnum.DRAFT,
        reviewerEmployeeId: employee.reports_to,
        submittedAt: null,
        reviewedByCompanyUserId: null,
        reviewedAt: null,
        reviewComment: null,
      }),
    );
    await this.appendHistory(this.dataSource.manager, kpi, actor, null, null);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.EMPLOYEE_KPI_CREATED,
      actor,
      employeeId,
      afterValues: this.snapshot(kpi),
    });
    return this.getOwn(actor, kpi.id);
  }

  async update(
    actor: AuthenticatedUser,
    id: number,
    dto: UpdateEmployeeKpiDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employeeId = this.requireEmployee(actor);
    const kpi = await this.kpiRepository.findOne({
      where: { id, companyId, employeeId },
      relations: { performancePeriod: true },
    });
    if (!kpi) throw new NotFoundException('Employee KPI not found.');
    if (!EDITABLE_STATUSES.includes(kpi.status)) {
      throw new ConflictException('Only draft or returned KPIs can be edited.');
    }
    if (kpi.performancePeriod.status !== PerformancePeriodStatusEnum.OPEN) {
      throw new ConflictException('The performance period is not open.');
    }
    if (
      dto.performance_period_id !== undefined &&
      dto.performance_period_id !== kpi.performancePeriodId
    ) {
      throw new BadRequestException('A KPI cannot be moved to another period.');
    }
    const startDate = dto.start_date ?? kpi.startDate ?? undefined;
    const dueDate = dto.due_date ?? kpi.dueDate;
    this.validateKpiDates(kpi.performancePeriod, startDate, dueDate);
    this.validateMeasurement(
      dto.measurement_type ?? kpi.measurementType,
      dto.target_value ??
        (kpi.targetValue === null ? undefined : Number(kpi.targetValue)),
    );
    const before = this.snapshot(kpi);
    kpi.title = dto.title?.trim() ?? kpi.title;
    kpi.description = dto.description?.trim() ?? kpi.description;
    kpi.measurementType = dto.measurement_type ?? kpi.measurementType;
    if (dto.target_value !== undefined)
      kpi.targetValue = String(dto.target_value);
    if (dto.unit !== undefined) kpi.unit = dto.unit.trim() || null;
    if (dto.weight !== undefined) kpi.weight = String(dto.weight);
    if (dto.start_date !== undefined) kpi.startDate = dto.start_date;
    if (dto.due_date !== undefined) kpi.dueDate = dto.due_date;
    if (dto.progress_source !== undefined)
      kpi.progressSource = dto.progress_source;
    const saved = await this.kpiRepository.save(kpi);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.EMPLOYEE_KPI_UPDATED,
      actor,
      employeeId,
      beforeValues: before,
      afterValues: this.snapshot(saved),
    });
    return this.getOwn(actor, saved.id);
  }

  async remove(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employeeId = this.requireEmployee(actor);
    const kpi = await this.kpiRepository.findOne({
      where: { id, companyId, employeeId },
      relations: { performancePeriod: true },
    });
    if (!kpi) throw new NotFoundException('Employee KPI not found.');
    if (!EDITABLE_STATUSES.includes(kpi.status)) {
      throw new ConflictException('Only draft or returned KPIs can be deleted.');
    }
    if (kpi.performancePeriod.status !== PerformancePeriodStatusEnum.OPEN) {
      throw new ConflictException('The performance period is not open.');
    }

    const snapshot = this.snapshot(kpi);
    await this.kpiRepository.remove(kpi);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.EMPLOYEE_KPI_DELETED,
      actor,
      employeeId,
      beforeValues: snapshot,
      afterValues: { deleted: true, employee_kpi_id: id },
    });
    return { id, deleted: true };
  }

  async submitPeriod(actor: AuthenticatedUser, performancePeriodId: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employeeId = this.requireEmployee(actor);
    const submittedIds = await this.dataSource.transaction(async (manager) => {
      const period = await manager.getRepository(PerformancePeriod).findOne({
        where: { id: performancePeriodId, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!period) throw new NotFoundException('Performance period not found.');
      if (period.status !== PerformancePeriodStatusEnum.OPEN) {
        throw new ConflictException('The performance period is not open.');
      }
      const kpis = await manager.getRepository(EmployeeKpi).find({
        where: { companyId, employeeId, performancePeriodId },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      const candidates = kpis.filter((kpi) =>
        EDITABLE_STATUSES.includes(kpi.status),
      );
      if (candidates.length === 0) {
        throw new ConflictException(
          'There are no draft or returned KPIs to submit.',
        );
      }
      const included = kpis.filter(
        (kpi) => kpi.status !== EmployeeKpiStatusEnum.REJECTED,
      );
      this.validateWeightTotal(included);
      const now = new Date();
      for (const kpi of candidates) {
        const fromStatus = kpi.status;
        kpi.status =
          fromStatus === EmployeeKpiStatusEnum.RETURNED
            ? EmployeeKpiStatusEnum.RESUBMITTED
            : EmployeeKpiStatusEnum.SUBMITTED;
        kpi.submittedAt = now;
        await manager.getRepository(EmployeeKpi).save(kpi);
        await this.appendHistory(manager, kpi, actor, fromStatus, null);
      }
      return candidates.map((kpi) => kpi.id);
    });

    await this.auditService.log({
      action: PerformanceAuditActionEnum.EMPLOYEE_KPI_SUBMITTED,
      actor,
      employeeId,
      afterValues: {
        performance_period_id: performancePeriodId,
        employee_kpi_ids: submittedIds,
      },
    });
    const employee = await this.getEmployee(companyId, employeeId);
    void this.notifyManager(actor, employee, performancePeriodId, submittedIds);
    return this.listOwn(actor, { performance_period_id: performancePeriodId });
  }

  async markPendingReview(actor: AuthenticatedUser, id: number) {
    const transition = await this.dataSource.transaction(async (manager) => {
      const kpi = await this.lockReviewable(manager, actor, id);
      const fromStatus = kpi.status;
      if (fromStatus === EmployeeKpiStatusEnum.PENDING_REVIEW) {
        return { saved: kpi, changed: false };
      }
      kpi.status = EmployeeKpiStatusEnum.PENDING_REVIEW;
      const saved = await manager.getRepository(EmployeeKpi).save(kpi);
      await this.appendHistory(manager, saved, actor, fromStatus, null);
      return { saved, changed: true };
    });
    if (transition.changed) {
      await this.auditService.log({
        action: PerformanceAuditActionEnum.EMPLOYEE_KPI_REVIEW_STARTED,
        actor,
        employeeId: transition.saved.employeeId,
        afterValues: this.snapshot(transition.saved),
      });
    }
    return this.withProgress(transition.saved);
  }

  async review(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewEmployeeKpiDto,
  ) {
    const saved = await this.dataSource.transaction(async (manager) => {
      const kpi = await this.lockReviewable(manager, actor, id);
      if (
        [
          EmployeeKpiReviewDecisionEnum.RETURN,
          EmployeeKpiReviewDecisionEnum.REJECT,
        ].includes(dto.decision) &&
        !dto.comment?.trim()
      ) {
        throw new BadRequestException(
          'A comment is required for return or rejection.',
        );
      }
      let fromStatus = kpi.status;
      if (fromStatus !== EmployeeKpiStatusEnum.PENDING_REVIEW) {
        kpi.status = EmployeeKpiStatusEnum.PENDING_REVIEW;
        const pending = await manager.getRepository(EmployeeKpi).save(kpi);
        await this.appendHistory(manager, pending, actor, fromStatus, null);
        fromStatus = EmployeeKpiStatusEnum.PENDING_REVIEW;
      }
      switch (dto.decision) {
        case EmployeeKpiReviewDecisionEnum.APPROVE:
          kpi.status = EmployeeKpiStatusEnum.APPROVED;
          break;
        case EmployeeKpiReviewDecisionEnum.RETURN:
          kpi.status = EmployeeKpiStatusEnum.RETURNED;
          break;
        case EmployeeKpiReviewDecisionEnum.REJECT:
          kpi.status = EmployeeKpiStatusEnum.REJECTED;
          break;
      }
      kpi.reviewedByCompanyUserId = actor.companyMembershipId ?? null;
      kpi.reviewedAt = new Date();
      kpi.reviewComment = dto.comment?.trim() ?? null;
      const result = await manager.getRepository(EmployeeKpi).save(kpi);
      await this.appendHistory(manager, result, actor, fromStatus, dto);
      return result;
    });
    await this.auditService.log({
      action: PerformanceAuditActionEnum.EMPLOYEE_KPI_REVIEWED,
      actor,
      employeeId: saved.employeeId,
      afterValues: this.snapshot(saved),
      reason: dto.comment?.trim() ?? null,
    });
    void this.notifyEmployee(actor, saved);
    return this.getTeamOne(actor, saved.id);
  }

  async updateActual(
    actor: AuthenticatedUser,
    id: number,
    dto: UpdateEmployeeKpiActualDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employeeId = this.requireEmployee(actor);
    const kpi = await this.kpiRepository.findOne({
      where: { id, companyId, employeeId },
      relations: { performancePeriod: true },
    });
    if (!kpi) throw new NotFoundException('Employee KPI not found.');
    if (kpi.status !== EmployeeKpiStatusEnum.APPROVED) {
      throw new ConflictException('Only an approved KPI can record progress.');
    }
    if (CLOSED_PERIOD_STATUSES.includes(kpi.performancePeriod.status)) {
      throw new ConflictException('The performance period is closed.');
    }
    const before = kpi.actualValue;
    kpi.actualValue = String(dto.actual_value);
    const saved = await this.kpiRepository.save(kpi);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.EMPLOYEE_KPI_ACTUAL_UPDATED,
      actor,
      employeeId,
      beforeValues: { actual_value: before },
      afterValues: { actual_value: saved.actualValue },
    });
    return this.withProgress(saved);
  }

  async listOwn(actor: AuthenticatedUser, query: EmployeeKpiQueryDto) {
    return this.listScoped(actor, query, this.requireEmployee(actor));
  }

  async listTeam(actor: AuthenticatedUser, query: EmployeeKpiQueryDto) {
    return this.listScoped(actor, query, null);
  }

  async getOwn(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const kpi = await this.kpiRepository.findOne({
      where: { id, companyId, employeeId: this.requireEmployee(actor) },
      relations: { performancePeriod: true, reviewHistory: true },
    });
    if (!kpi) throw new NotFoundException('Employee KPI not found.');
    return this.withProgress(kpi);
  }

  async getTeamOne(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const kpi = await this.kpiRepository.findOne({
      where: { id, companyId },
      relations: {
        employee: true,
        reviewer: true,
        performancePeriod: true,
        reviewHistory: true,
      },
    });
    if (!kpi) throw new NotFoundException('Employee KPI not found.');
    await this.assertReviewer(actor, kpi);
    return this.withProgress(kpi);
  }

  private async listScoped(
    actor: AuthenticatedUser,
    query: EmployeeKpiQueryDto,
    ownEmployeeId: number | null,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const qb = this.kpiRepository
      .createQueryBuilder('kpi')
      .leftJoinAndSelect('kpi.employee', 'employee')
      .leftJoinAndSelect('kpi.performancePeriod', 'period')
      .where('kpi.companyId = :companyId', { companyId });
    if (ownEmployeeId !== null) {
      qb.andWhere('kpi.employeeId = :ownEmployeeId', { ownEmployeeId });
    } else if (!this.hrAccessService.hasCompanyScope(actor)) {
      const accessibleIds =
        await this.hrAccessService.getAccessibleEmployeeIds(actor);
      if (!accessibleIds?.length) {
        return { data: [], meta: this.meta(page, limit, 0) };
      }
      qb.andWhere('kpi.employeeId IN (:...accessibleIds)', { accessibleIds });
    }
    if (query.performance_period_id) {
      qb.andWhere('kpi.performancePeriodId = :periodId', {
        periodId: query.performance_period_id,
      });
    }
    if (query.employee_id)
      qb.andWhere('kpi.employeeId = :employeeId', {
        employeeId: query.employee_id,
      });
    if (query.department_id)
      qb.andWhere('employee.primary_department_id = :departmentId', {
        departmentId: query.department_id,
      });
    if (query.status)
      qb.andWhere('kpi.status = :status', { status: query.status });
    if (query.reviewer_employee_id)
      qb.andWhere('kpi.reviewerEmployeeId = :reviewerId', {
        reviewerId: query.reviewer_employee_id,
      });
    if (query.search?.trim()) {
      qb.andWhere(
        '(LOWER(kpi.title) LIKE :search OR LOWER(kpi.description) LIKE :search)',
        {
          search: `%${query.search.trim().toLowerCase()}%`,
        },
      );
    }
    const [items, total] = await qb
      .orderBy('kpi.updatedAt', 'DESC')
      .addOrderBy('kpi.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      data: await Promise.all(items.map((item) => this.withProgress(item))),
      meta: this.meta(page, limit, total),
    };
  }

  private async lockReviewable(
    manager: EntityManager,
    actor: AuthenticatedUser,
    id: number,
  ): Promise<EmployeeKpi> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const kpi = await manager.getRepository(EmployeeKpi).findOne({
      where: { id, companyId },
      relations: { performancePeriod: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (!kpi) throw new NotFoundException('Employee KPI not found.');
    await this.assertReviewer(actor, kpi);
    if (!REVIEWABLE_STATUSES.includes(kpi.status)) {
      throw new ConflictException('The KPI is not awaiting review.');
    }
    if (CLOSED_PERIOD_STATUSES.includes(kpi.performancePeriod.status)) {
      throw new ConflictException('The performance period is closed.');
    }
    return kpi;
  }

  private async assertReviewer(actor: AuthenticatedUser, kpi: EmployeeKpi) {
    if (this.hrAccessService.hasCompanyScope(actor)) return;
    if (actor.employeeId && actor.employeeId === kpi.reviewerEmployeeId) return;
    const accessible =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);
    if (accessible?.includes(kpi.employeeId)) return;
    throw new ForbiddenException(
      'You are not authorized to review this employee KPI.',
    );
  }

  private validateWeightTotal(kpis: EmployeeKpi[]): void {
    const total = kpis.reduce(
      (sum, kpi) => sum.plus(kpi.weight),
      new Decimal(0),
    );
    const minimum = new Decimal(
      this.configService.get<number>('PERFORMANCE_MINIMUM_WEIGHT_TOTAL', 100),
    );
    const maximum = new Decimal(
      this.configService.get<number>('PERFORMANCE_MAXIMUM_WEIGHT_TOTAL', 100),
    );
    if (total.lt(minimum) || total.gt(maximum)) {
      throw new BadRequestException(
        `KPI weights must total between ${minimum.toString()} and ${maximum.toString()} before submission. Current total: ${total.toString()}.`,
      );
    }
  }

  private validateKpiDates(
    period: PerformancePeriod,
    startDate: string | undefined,
    dueDate: string,
  ) {
    if (startDate && startDate > dueDate) {
      throw new BadRequestException(
        'due_date must not be earlier than start_date.',
      );
    }
    if (
      (startDate && startDate < period.startDate) ||
      dueDate < period.startDate ||
      dueDate > period.endDate
    ) {
      throw new BadRequestException(
        'KPI dates must fall within the performance period.',
      );
    }
  }

  private validateMeasurement(type: string, targetValue?: number) {
    if (type !== 'MANUAL' && targetValue === undefined) {
      throw new BadRequestException(
        'target_value is required for this measurement type.',
      );
    }
  }

  private async getOpenPeriod(companyId: number, id: number) {
    const period = await this.periodRepository.findOne({
      where: { id, companyId },
    });
    if (!period) throw new NotFoundException('Performance period not found.');
    if (period.status !== PerformancePeriodStatusEnum.OPEN) {
      throw new ConflictException(
        'KPIs can only be created in an open period.',
      );
    }
    return period;
  }

  private async getEmployee(companyId: number, id: number) {
    const employee = await this.employeeRepository.findOne({
      where: { id, company_id: companyId },
    });
    if (!employee) throw new NotFoundException('Employee not found.');
    return employee;
  }

  private requireEmployee(actor: AuthenticatedUser): number {
    if (!actor.employeeId)
      throw new ForbiddenException('Employee profile is required.');
    return actor.employeeId;
  }

  private async appendHistory(
    manager: EntityManager,
    kpi: EmployeeKpi,
    actor: AuthenticatedUser,
    fromStatus: EmployeeKpiStatusEnum | null,
    review: ReviewEmployeeKpiDto | null,
  ) {
    await manager.getRepository(EmployeeKpiReviewHistory).save(
      manager.getRepository(EmployeeKpiReviewHistory).create({
        companyId: kpi.companyId,
        employeeKpiId: kpi.id,
        actorCompanyUserId: actor.companyMembershipId ?? null,
        actorEmployeeId: actor.employeeId ?? null,
        fromStatus,
        toStatus: kpi.status,
        decision: review?.decision ?? null,
        comment: review?.comment?.trim() ?? null,
        snapshot: this.snapshot(kpi),
      }),
    );
  }

  private async withProgress(kpi: EmployeeKpi) {
    return { ...kpi, progress: await this.progressService.calculate(kpi) };
  }

  private snapshot(kpi: EmployeeKpi) {
    return {
      id: kpi.id,
      performance_period_id: kpi.performancePeriodId,
      employee_id: kpi.employeeId,
      title: kpi.title,
      measurement_type: kpi.measurementType,
      target_value: kpi.targetValue,
      actual_value: kpi.actualValue,
      weight: kpi.weight,
      status: kpi.status,
      reviewer_employee_id: kpi.reviewerEmployeeId,
      version: kpi.version,
    };
  }

  private meta(page: number, limit: number, total: number) {
    return { page, limit, total, total_pages: Math.ceil(total / limit) };
  }

  private async notifyManager(
    actor: AuthenticatedUser,
    employee: Employee,
    periodId: number,
    kpiIds: number[],
  ) {
    try {
      if (!employee.reports_to) return;
      const manager = await this.getEmployee(
        employee.company_id,
        employee.reports_to,
      );
      if (!manager.company_user_id) return;
      await this.notificationsService.createAndPush({
        company_id: employee.company_id,
        sender_company_user_id: actor.companyMembershipId ?? null,
        receiver_company_user_id: manager.company_user_id,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'KPIs awaiting review',
        message: `${employee.first_name} ${employee.last_name} submitted ${kpiIds.length} KPI${kpiIds.length === 1 ? '' : 's'} for review.`,
        related_module: 'PERFORMANCE',
        entity_type: 'PERFORMANCE_PERIOD',
        entity_id: periodId,
        action_url: '/dashboard/me/performance/kpi-reviews',
        dedupe_key: `employee-kpis-submitted:${periodId}:${employee.id}:${kpiIds.join('-')}`,
      });
    } catch (error) {
      this.logger.warn(
        `KPI submission notification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async notifyEmployee(actor: AuthenticatedUser, kpi: EmployeeKpi) {
    try {
      const employee = await this.getEmployee(kpi.companyId, kpi.employeeId);
      if (!employee.company_user_id) return;
      await this.notificationsService.createAndPush({
        company_id: kpi.companyId,
        sender_company_user_id: actor.companyMembershipId ?? null,
        receiver_company_user_id: employee.company_user_id,
        category: NotificationCategoryEnum.HR,
        priority:
          kpi.status === EmployeeKpiStatusEnum.APPROVED
            ? NotificationPriorityEnum.MEDIUM
            : NotificationPriorityEnum.HIGH,
        title: `KPI ${kpi.status.toLowerCase().replaceAll('_', ' ')}`,
        message: kpi.reviewComment
          ? `${kpi.title}: ${kpi.reviewComment}`
          : `${kpi.title} was ${kpi.status.toLowerCase()}.`,
        related_module: 'PERFORMANCE',
        entity_type: 'EMPLOYEE_KPI',
        entity_id: kpi.id,
        action_url: '/dashboard/me/performance/kpis',
        dedupe_key: `employee-kpi-review:${kpi.id}:${kpi.version}`,
      });
    } catch (error) {
      this.logger.warn(
        `KPI review notification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
