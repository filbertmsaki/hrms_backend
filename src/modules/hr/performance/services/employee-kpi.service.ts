import { assertWeightTotal } from '../utils/workflow-validation';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { NotificationsService } from '../../../notifications/notifications.service';
import { NotificationCategoryEnum } from '../../../notifications/enums/notification-category.enum';
import { NotificationPriorityEnum } from '../../../notifications/enums/notification-priority.enum';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  CreateEmployeeKpiDto,
  CreateAssignedEmployeeKpiDto,
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
import { kpiCycleToday } from '../utils/kpi-cycle-date';
import {
  KPI_DOMAIN_EVENTS,
  type KpiAssignmentEvent,
} from '../events/kpi-domain-events';

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
    private readonly events: EventEmitter2,
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
    this.validateMeasurement(
      dto.measurement_type,
      dto.target_value,
      dto.scoring_type,
    );

    const kpi = await this.dataSource.transaction(async (manager) => {
      const lockedPeriod = await manager
        .getRepository(PerformancePeriod)
        .findOne({
          where: { id: period.id, companyId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!lockedPeriod)
        throw new NotFoundException('Performance period not found.');
      this.assertGoalSettingOpen(lockedPeriod);
      const siblings = await manager.getRepository(EmployeeKpi).find({
        where: { companyId, employeeId, performancePeriodId: period.id },
      });
      if (
        siblings.some(
          (item) =>
            item.status !== EmployeeKpiStatusEnum.REJECTED &&
            item.title.trim().toLocaleLowerCase() ===
              dto.title.trim().toLocaleLowerCase(),
        )
      ) {
        throw new ConflictException(
          'This KPI already exists for the employee in this period.',
        );
      }
      const totalWeight = siblings
        .filter((item) => item.status !== EmployeeKpiStatusEnum.REJECTED)
        .reduce((sum, item) => sum.plus(item.weight), new Decimal(0))
        .plus(dto.weight);
      if (totalWeight.gt(this.maximumWeight(lockedPeriod))) {
        throw new BadRequestException('KPI weights exceed the cycle maximum.');
      }
      const created = await manager.getRepository(EmployeeKpi).save(
        manager.getRepository(EmployeeKpi).create({
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
          scoringType: dto.scoring_type ?? 'NUMERIC_TARGET',
          measurementDirection: dto.measurement_direction ?? 'HIGHER_IS_BETTER',
          formulaConfig: dto.formula_config ?? null,
        }),
      );
      await this.appendHistory(manager, created, actor, null, null);
      return created;
    });
    await this.auditService.log({
      action: PerformanceAuditActionEnum.EMPLOYEE_KPI_CREATED,
      actor,
      employeeId,
      afterValues: this.snapshot(kpi),
    });
    return this.getOwn(actor, kpi.id);
  }

  async assignToEmployee(
    actor: AuthenticatedUser,
    dto: CreateAssignedEmployeeKpiDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employee = await this.getEmployee(companyId, dto.employee_id);
    if (
      actor.employeeId === employee.id &&
      !this.hrAccessService.hasCompanyScope(actor)
    ) {
      throw new ForbiddenException(
        'Managers may assign KPIs only to reportees.',
      );
    }
    const allowedEmployees =
      await this.hrAccessService.getReportingEmployeeIds(actor);
    if (
      !this.hrAccessService.hasCompanyScope(actor) &&
      !allowedEmployees?.includes(employee.id)
    ) {
      throw new ForbiddenException(
        'You may only assign KPIs within your reporting scope.',
      );
    }
    const period = await this.getOpenPeriod(
      companyId,
      dto.performance_period_id,
    );
    this.validateKpiDates(period, dto.start_date, dto.due_date);
    this.validateMeasurement(
      dto.measurement_type,
      dto.target_value,
      dto.scoring_type,
    );

    const kpiId = await this.dataSource.transaction(async (manager) => {
      const lockedPeriod = await manager
        .getRepository(PerformancePeriod)
        .findOne({
          where: { id: period.id, companyId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!lockedPeriod)
        throw new NotFoundException('Performance period not found.');
      this.assertGoalSettingOpen(lockedPeriod);
      const siblings = await manager.getRepository(EmployeeKpi).find({
        where: {
          companyId,
          employeeId: employee.id,
          performancePeriodId: period.id,
        },
        lock: { mode: 'pessimistic_write' },
      });
      const duplicate = siblings.some(
        (item) =>
          item.title.trim().toLocaleLowerCase() ===
            dto.title.trim().toLocaleLowerCase() &&
          item.status !== EmployeeKpiStatusEnum.REJECTED,
      );
      if (duplicate)
        throw new ConflictException(
          'This KPI already exists for the employee in this period.',
        );
      const assignedWeight = siblings
        .filter((item) => item.status !== EmployeeKpiStatusEnum.REJECTED)
        .reduce((sum, item) => sum.plus(item.weight), new Decimal(0));
      const maxWeight = this.maximumWeight(lockedPeriod);
      if (assignedWeight.plus(dto.weight).gt(maxWeight)) {
        throw new BadRequestException(
          `KPI weights cannot exceed ${maxWeight.toString()} for this period.`,
        );
      }

      const created = await manager.getRepository(EmployeeKpi).save(
        manager.getRepository(EmployeeKpi).create({
          companyId,
          performancePeriodId: period.id,
          employeeId: employee.id,
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
          status: EmployeeKpiStatusEnum.SUBMITTED,
          reviewerEmployeeId: actor.employeeId ?? null,
          submittedAt: new Date(),
          reviewedByCompanyUserId: null,
          reviewedAt: null,
          reviewComment: null,
          scoringType: dto.scoring_type ?? 'NUMERIC_TARGET',
          measurementDirection: dto.measurement_direction ?? 'HIGHER_IS_BETTER',
          formulaConfig: dto.formula_config ?? null,
        }),
      );
      await this.appendHistory(manager, created, actor, null, null);
      return created.id;
    });
    const kpi = await this.kpiRepository.findOneByOrFail({
      id: kpiId,
      companyId,
    });
    await this.auditService.log({
      action: PerformanceAuditActionEnum.EMPLOYEE_KPI_ASSIGNED,
      actor,
      employeeId: employee.id,
      afterValues: this.snapshot(kpi),
    });
    this.emitAssignment(KPI_DOMAIN_EVENTS.ASSIGNED, kpi);
    return this.getTeamOne(actor, kpi.id);
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
    this.assertGoalSettingOpen(kpi.performancePeriod);
    if (
      dto.performance_period_id !== undefined &&
      dto.performance_period_id !== kpi.performancePeriodId
    ) {
      throw new BadRequestException('A KPI cannot be moved to another period.');
    }
    if (dto.weight !== undefined) {
      const siblings = await this.kpiRepository.find({
        where: {
          companyId,
          employeeId,
          performancePeriodId: kpi.performancePeriodId,
        },
      });
      const maxWeight = this.maximumWeight(kpi.performancePeriod);
      const proposedTotal = siblings
        .filter(
          (item) =>
            item.id !== kpi.id &&
            item.status !== EmployeeKpiStatusEnum.REJECTED,
        )
        .reduce((sum, item) => sum.plus(item.weight), new Decimal(0))
        .plus(dto.weight);
      if (proposedTotal.gt(maxWeight)) {
        throw new BadRequestException(
          `KPI weights cannot exceed ${maxWeight.toString()} for this period.`,
        );
      }
    }
    const startDate = dto.start_date ?? kpi.startDate ?? undefined;
    const dueDate = dto.due_date ?? kpi.dueDate;
    this.validateKpiDates(kpi.performancePeriod, startDate, dueDate);
    this.validateMeasurement(
      dto.measurement_type ?? kpi.measurementType,
      dto.target_value ??
        (kpi.targetValue === null ? undefined : Number(kpi.targetValue)),
      dto.scoring_type ?? kpi.scoringType,
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
    if (dto.scoring_type !== undefined) kpi.scoringType = dto.scoring_type;
    if (dto.measurement_direction !== undefined)
      kpi.measurementDirection = dto.measurement_direction;
    if (dto.formula_config !== undefined)
      kpi.formulaConfig = dto.formula_config;
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
      throw new ConflictException(
        'Only draft or returned KPIs can be deleted.',
      );
    }
    this.assertGoalSettingOpen(kpi.performancePeriod);

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
      this.assertGoalSettingOpen(period);
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
      this.validateWeightTotal(included, period);
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
    for (const id of submittedIds)
      this.events.emit(KPI_DOMAIN_EVENTS.PROPOSAL_SUBMITTED, {
        companyId,
        cycleId: performancePeriodId,
        employeeId,
        employeeKpiId: id,
        occurredAt: new Date().toISOString(),
      } satisfies KpiAssignmentEvent);
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
      if (dto.decision === EmployeeKpiReviewDecisionEnum.APPROVE) {
        const periodKpis = await manager.getRepository(EmployeeKpi).find({
          where: {
            companyId: kpi.companyId,
            employeeId: kpi.employeeId,
            performancePeriodId: kpi.performancePeriodId,
          },
          order: { id: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });
        const included = periodKpis.filter(
          (item) =>
            item.id === kpi.id ||
            ![
              EmployeeKpiStatusEnum.REJECTED,
              EmployeeKpiStatusEnum.RETURNED,
            ].includes(item.status),
        );
        this.validateWeightTotal(included, kpi.performancePeriod);
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
    if (saved.status === EmployeeKpiStatusEnum.APPROVED) {
      this.emitAssignment(KPI_DOMAIN_EVENTS.PROPOSAL_APPROVED, saved);
      this.emitAssignment(KPI_DOMAIN_EVENTS.APPROVED, saved);
      this.emitAssignment(KPI_DOMAIN_EVENTS.LOCKED, saved);
    }
    return this.getTeamOne(actor, saved.id);
  }

  private emitAssignment(event: string, kpi: EmployeeKpi): void {
    this.events.emit(event, {
      companyId: kpi.companyId,
      cycleId: kpi.performancePeriodId,
      employeeId: kpi.employeeId,
      employeeKpiId: kpi.id,
      occurredAt: new Date().toISOString(),
    } satisfies KpiAssignmentEvent);
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
    if (['LOCKED', 'CLOSED'].includes(kpi.performancePeriod.kpiPhase ?? '')) {
      throw new ConflictException('The KPI cycle is locked.');
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

  async listAssignableEmployees(actor: AuthenticatedUser) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const reporteeIds = this.hrAccessService.hasCompanyScope(actor)
      ? null
      : await this.hrAccessService.getReportingEmployeeIds(actor);
    if (reporteeIds !== null && !reporteeIds.length) return [];
    const employees = await this.employeeRepository.find({
      where: {
        company_id: companyId,
        employment_status: EmploymentStatusEnum.ACTIVE,
        ...(reporteeIds === null ? {} : { id: In(reporteeIds) }),
      },
      order: { first_name: 'ASC', last_name: 'ASC' },
    });
    return employees.map((employee) => ({
      id: employee.id,
      full_name: [employee.first_name, employee.middle_name, employee.last_name]
        .filter(Boolean)
        .join(' '),
      employee_no: employee.employee_no,
    }));
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
        await this.hrAccessService.getReportingEmployeeIds(actor);
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
    const accessible =
      await this.hrAccessService.getReportingEmployeeIds(actor);
    if (accessible?.includes(kpi.employeeId)) return;
    throw new ForbiddenException(
      'You are not authorized to review this employee KPI.',
    );
  }

  private maximumWeight(period: PerformancePeriod): Decimal {
    return new Decimal(
      period.kpiPhase
        ? period.maxWeightage
        : this.configService.get<number>(
            'PERFORMANCE_MAXIMUM_WEIGHT_TOTAL',
            100,
          ),
    );
  }

  private validateWeightTotal(
    kpis: EmployeeKpi[],
    period: PerformancePeriod,
  ): void {
    const total = kpis.reduce(
      (sum, kpi) => sum.plus(kpi.weight),
      new Decimal(0),
    );
    const maximum = this.maximumWeight(period);
    assertWeightTotal(
      kpis.map((kpi) => Number(kpi.weight)),
      'Employee KPI set',
    );
    if (total.gt(maximum)) {
      throw new BadRequestException(
        `The KPI set totals 100%, but this cycle permits only ${maximum.toString()}%. Ask HR to correct the cycle maximum before submission.`,
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

  private validateMeasurement(
    type: string,
    targetValue?: number,
    scoringType?: string,
  ) {
    if (
      type !== 'MANUAL' &&
      scoringType !== 'RATING_SCALE' &&
      targetValue === undefined
    ) {
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
    this.assertGoalSettingOpen(period);
    return period;
  }

  private assertGoalSettingOpen(period: PerformancePeriod): void {
    if (period.status !== PerformancePeriodStatusEnum.OPEN) {
      throw new ConflictException(
        'KPIs can only be changed in an open period.',
      );
    }
    if (!period.kpiPhase || period.kpiPhase === 'REOPENED') return;
    const today = kpiCycleToday();
    if (
      period.kpiPhase !== 'GOAL_SETTING' ||
      today < period.startDate ||
      !period.goalSettingDeadline ||
      today > period.goalSettingDeadline
    ) {
      throw new ConflictException('The KPI goal-setting window is closed.');
    }
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
