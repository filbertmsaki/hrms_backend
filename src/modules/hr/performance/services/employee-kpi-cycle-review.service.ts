import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { LeaveRequest } from '../../leave/entities/leave-request.entity';
import { LeaveStatusEnum } from '../../leave/enums/leave-status.enum';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  FinalizeKpiReviewDto,
  ReopenKpiReviewDto,
  RespondToMidKpiReviewDto,
  SubmitKpiManagerReviewDto,
  SubmitKpiSelfReviewDto,
} from '../dto/employee-kpi-cycle-review.dto';
import { EmployeeKpiCycleReview } from '../entities/employee-kpi-cycle-review.entity';
import { EmployeeKpiCycleScore } from '../entities/employee-kpi-cycle-score.entity';
import { EmployeeKpi } from '../entities/employee-kpi.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import { EmployeeKpiStatusEnum } from '../enums/employee-kpi-status.enum';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import {
  KPI_DOMAIN_EVENTS,
  type KpiCycleEvent,
  type KpiFinalScoreLockedEvent,
} from '../events/kpi-domain-events';
import { kpiCycleToday } from '../utils/kpi-cycle-date';
import { PerformanceAuditService } from './performance-audit.service';
import { EmployeeKpiProgressService } from './employee-kpi-progress.service';

type Kind = 'MID' | 'FINAL';

@Injectable()
export class EmployeeKpiCycleReviewService implements OnModuleInit {
  constructor(
    private readonly access: HrAccessService,
    private readonly audit: PerformanceAuditService,
    private readonly progress: EmployeeKpiProgressService,
    private readonly events: EventEmitter2,
    @InjectRepository(EmployeeKpi)
    private readonly kpis: Repository<EmployeeKpi>,
    @InjectRepository(PerformancePeriod)
    private readonly periods: Repository<PerformancePeriod>,
    @InjectRepository(EmployeeKpiCycleReview)
    private readonly reviews: Repository<EmployeeKpiCycleReview>,
    @InjectRepository(EmployeeKpiCycleScore)
    private readonly scores: Repository<EmployeeKpiCycleScore>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(LeaveRequest)
    private readonly leaves: Repository<LeaveRequest>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.createScheduledReviews();
  }

  @Cron('0 0 2 * * *', { timeZone: 'Africa/Dar_es_Salaam' })
  async createScheduledReviews(): Promise<void> {
    const periods = await this.periods.find({
      where: {
        kpiPhase: In([
          'IN_PROGRESS',
          'MID_REVIEW',
          'FINAL_REVIEW',
          'LOCKED',
          'REOPENED',
          'CLOSED',
        ]),
      },
    });
    for (const period of periods) {
      const kinds: Kind[] = [];
      if (
        period.midCycleReviewDate &&
        period.midCycleReviewDate <= kpiCycleToday()
      )
        kinds.push('MID');
      if (
        ['FINAL_REVIEW', 'LOCKED', 'REOPENED', 'CLOSED'].includes(
          period.kpiPhase ?? '',
        )
      )
        kinds.push('FINAL');
      if (!kinds.length) continue;
      const kpis = await this.kpis.find({
        where: {
          performancePeriodId: period.id,
          status: EmployeeKpiStatusEnum.APPROVED,
        },
      });
      if (!kpis.length) continue;
      for (const kind of kinds)
        await this.reviews
          .createQueryBuilder()
          .insert()
          .into(EmployeeKpiCycleReview)
          .values(
            kpis.map((kpi) => ({
              companyId: kpi.companyId,
              performancePeriodId: period.id,
              employeeId: kpi.employeeId,
              employeeKpiId: kpi.id,
              kind,
              status: 'PENDING' as const,
            })),
          )
          .orIgnore()
          .execute();
    }
  }

  @OnEvent(KPI_DOMAIN_EVENTS.CYCLE_REOPENED)
  async onCycleReopened(event: KpiCycleEvent): Promise<void> {
    await this.scores.update(
      { companyId: event.companyId, performancePeriodId: event.cycleId },
      { status: 'REOPENED', lockedAt: null },
    );
  }

  @OnEvent(KPI_DOMAIN_EVENTS.CYCLE_LOCKED)
  async onCycleLocked(event: KpiCycleEvent): Promise<void> {
    await this.scores.update(
      { companyId: event.companyId, performancePeriodId: event.cycleId },
      { status: 'LOCKED', lockedAt: new Date() },
    );
  }

  async listOwn(actor: AuthenticatedUser, periodId?: number) {
    const companyId = this.access.ensureActorCompanyId(actor);
    if (!actor.employeeId)
      throw new ForbiddenException('Employee profile required.');
    return this.reviews.find({
      where: {
        companyId,
        employeeId: actor.employeeId,
        ...(periodId ? { performancePeriodId: periodId } : {}),
      },
      relations: { employeeKpi: true },
      order: { id: 'DESC' },
    });
  }

  async listTeam(actor: AuthenticatedUser, periodId?: number) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const reportees = this.access.hasCompanyScope(actor)
      ? null
      : await this.access.getReportingEmployeeIds(actor);
    if (reportees !== null && !reportees.length) return [];
    return this.reviews.find({
      where: {
        companyId,
        ...(reportees === null ? {} : { employeeId: In(reportees) }),
        ...(periodId ? { performancePeriodId: periodId } : {}),
      },
      relations: { employeeKpi: true },
      order: { id: 'DESC' },
    });
  }

  async listOwnScores(actor: AuthenticatedUser) {
    const companyId = this.access.ensureActorCompanyId(actor);
    if (!actor.employeeId)
      throw new ForbiddenException('Employee profile required.');
    return this.scores.find({
      where: { companyId, employeeId: actor.employeeId },
      order: { performancePeriodId: 'DESC' },
    });
  }

  async submitSelf(
    actor: AuthenticatedUser,
    kpiId: number,
    kind: Kind,
    dto: SubmitKpiSelfReviewDto,
  ) {
    this.assertKind(kind);
    const kpi = await this.getKpi(actor, kpiId);
    if (kpi.employeeId !== actor.employeeId)
      throw new ForbiddenException('Only the employee can self-rate this KPI.');
    this.assertPhase(kpi.performancePeriod, kind);
    const review = await this.ensureReview(kpi, kind);
    if (review.status === 'FINALIZED')
      throw new ConflictException('This review is finalized.');
    if (review.managerSubmittedAt)
      throw new ConflictException(
        'The manager has already submitted a rating.',
      );
    const before = this.snapshot(review);
    review.selfRating = String(dto.rating);
    review.selfComment = dto.comment?.trim() ?? null;
    review.selfSubmittedAt = new Date();
    review.status = 'SELF_SUBMITTED';
    const saved = await this.reviews.save(review);
    await this.audit.log({
      action: PerformanceAuditActionEnum.EMPLOYEE_KPI_SELF_RATED,
      actor,
      employeeId: kpi.employeeId,
      beforeValues: before,
      afterValues: this.snapshot(saved),
    });
    return saved;
  }

  async submitManager(
    actor: AuthenticatedUser,
    kpiId: number,
    kind: Kind,
    dto: SubmitKpiManagerReviewDto,
  ) {
    this.assertKind(kind);
    const kpi = await this.getKpi(actor, kpiId);
    await this.assertManager(actor, kpi.employeeId);
    this.assertPhase(kpi.performancePeriod, kind);
    const review = await this.ensureReview(kpi, kind);
    if (review.status === 'FINALIZED')
      throw new ConflictException('This review is finalized.');
    if (!review.selfSubmittedAt && kind === 'MID' && !dto.on_behalf)
      throw new ConflictException('Employee self-rating is required first.');
    if (!review.selfSubmittedAt && kind === 'FINAL' && !dto.comment?.trim())
      throw new BadRequestException(
        'Add a comment when reviewing without an employee self-rating.',
      );
    if (dto.on_behalf) {
      if (!dto.comment?.trim())
        throw new BadRequestException(
          'A comment is required when rating on behalf of an employee.',
        );
      const employee = await this.employees.findOneBy({
        id: kpi.employeeId,
        company_id: kpi.companyId,
      });
      const today = kpiCycleToday();
      const onLeave = await this.leaves
        .createQueryBuilder('leave')
        .where('leave.employee_id = :employeeId', {
          employeeId: kpi.employeeId,
        })
        .andWhere('leave.company_id = :companyId', { companyId: kpi.companyId })
        .andWhere('leave.status = :status', {
          status: LeaveStatusEnum.APPROVED,
        })
        .andWhere('leave.start_date <= :today AND leave.end_date >= :today', {
          today,
        })
        .getExists();
      if (
        employee?.employment_status === EmploymentStatusEnum.ACTIVE &&
        !onLeave
      )
        throw new ConflictException(
          'On-behalf review is allowed only while the employee is inactive or on approved leave.',
        );
    }
    const before = this.snapshot(review);
    review.managerRating = String(dto.rating);
    review.managerComment = dto.comment?.trim() ?? null;
    review.managerSubmittedAt = new Date();
    review.managerOnBehalf = Boolean(dto.on_behalf);
    review.status = 'MANAGER_SUBMITTED';
    if (kind === 'MID') {
      try {
        review.weightedScore = await this.weightedScore(kpi, review);
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        review.weightedScore = null;
      }
    }
    const saved = await this.reviews.save(review);
    await this.audit.log({
      action: PerformanceAuditActionEnum.EMPLOYEE_KPI_MANAGER_RATED,
      actor,
      employeeId: kpi.employeeId,
      beforeValues: before,
      afterValues: this.snapshot(saved),
    });
    if (kind === 'MID' && saved.selfSubmittedAt)
      this.events.emit(KPI_DOMAIN_EVENTS.MID_REVIEW_COMPLETED, {
        companyId: kpi.companyId,
        cycleId: kpi.performancePeriodId,
        employeeId: kpi.employeeId,
        employeeKpiId: kpi.id,
        occurredAt: new Date().toISOString(),
      });
    return saved;
  }

  async respondMid(
    actor: AuthenticatedUser,
    kpiId: number,
    dto: RespondToMidKpiReviewDto,
  ) {
    const kpi = await this.getKpi(actor, kpiId);
    this.assertPhase(kpi.performancePeriod, 'MID');
    if (kpi.employeeId !== actor.employeeId)
      throw new ForbiddenException(
        'Only the employee can respond to this review.',
      );
    const review = await this.ensureReview(kpi, 'MID');
    if (review.status !== 'MANAGER_SUBMITTED')
      throw new ConflictException(
        'The mid-cycle review has already been answered or is incomplete.',
      );
    if (dto.decision === 'DISPUTE' && !dto.comment?.trim())
      throw new BadRequestException('A dispute reason is required.');
    const before = this.snapshot(review);
    review.status = dto.decision === 'DISPUTE' ? 'DISPUTED' : 'ACKNOWLEDGED';
    review.disputeComment =
      dto.decision === 'DISPUTE' ? dto.comment!.trim() : null;
    review.disputedAt = dto.decision === 'DISPUTE' ? new Date() : null;
    review.acknowledgedAt = dto.decision === 'ACKNOWLEDGE' ? new Date() : null;
    const saved = await this.reviews.save(review);
    await this.audit.log({
      action: PerformanceAuditActionEnum.EMPLOYEE_KPI_MID_RESPONDED,
      actor,
      employeeId: kpi.employeeId,
      beforeValues: before,
      afterValues: this.snapshot(saved),
      reason: review.disputeComment,
    });
    return saved;
  }

  async finalize(
    actor: AuthenticatedUser,
    kpiId: number,
    dto: FinalizeKpiReviewDto,
  ) {
    const kpi = await this.getKpi(actor, kpiId);
    await this.assertManager(actor, kpi.employeeId);
    this.assertPhase(kpi.performancePeriod, 'FINAL');
    const review = await this.ensureReview(kpi, 'FINAL');
    if (review.status === 'FINALIZED') return review;
    if (!review.managerSubmittedAt)
      throw new ConflictException(
        'Manager rating is required before finalization.',
      );
    if (
      !review.selfSubmittedAt &&
      !review.managerOnBehalf &&
      !review.managerComment?.trim() &&
      !dto.comment?.trim()
    )
      throw new BadRequestException(
        'Add a comment when finalizing without an employee self-rating.',
      );
    const before = this.snapshot(review);
    review.weightedScore = await this.weightedScore(kpi, review);
    review.status = 'FINALIZED';
    review.finalizedAt = new Date();
    if (dto.comment?.trim())
      review.managerComment = [review.managerComment, dto.comment.trim()]
        .filter(Boolean)
        .join('\n');
    const saved = await this.reviews.save(review);
    await this.audit.log({
      action: PerformanceAuditActionEnum.EMPLOYEE_KPI_FINALIZED,
      actor,
      employeeId: kpi.employeeId,
      beforeValues: before,
      afterValues: this.snapshot(saved),
    });
    this.events.emit(KPI_DOMAIN_EVENTS.FINALIZED, {
      companyId: kpi.companyId,
      cycleId: kpi.performancePeriodId,
      employeeId: kpi.employeeId,
      employeeKpiId: kpi.id,
      occurredAt: new Date().toISOString(),
    });
    await this.lockEmployeeScoreIfComplete(
      actor,
      kpi.performancePeriod,
      kpi.employeeId,
    );
    return saved;
  }

  async reopenAssignment(
    actor: AuthenticatedUser,
    kpiId: number,
    dto: ReopenKpiReviewDto,
  ) {
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('A reopen reason is required.');
    if (!this.access.hasCompanyScope(actor))
      throw new ForbiddenException(
        'KPI reopening requires organization scope.',
      );
    const kpi = await this.getKpi(actor, kpiId);
    if (
      !['REOPENED', 'FINAL_REVIEW'].includes(
        kpi.performancePeriod.kpiPhase ?? '',
      )
    )
      throw new ConflictException(
        'Reopen the KPI cycle before changing a finalized KPI.',
      );
    const review = await this.reviews.findOneBy({
      companyId: kpi.companyId,
      employeeKpiId: kpi.id,
      kind: 'FINAL',
    });
    if (!review || review.status !== 'FINALIZED')
      throw new ConflictException(
        'Only a finalized KPI review can be reopened.',
      );
    const before = this.snapshot(review);
    review.status = 'PENDING';
    review.selfRating = null;
    review.selfComment = null;
    review.selfSubmittedAt = null;
    review.managerRating = null;
    review.managerComment = null;
    review.managerSubmittedAt = null;
    review.managerOnBehalf = false;
    review.weightedScore = null;
    review.finalizedAt = null;
    const saved = await this.reviews.save(review);
    await this.scores.update(
      {
        companyId: kpi.companyId,
        performancePeriodId: kpi.performancePeriodId,
        employeeId: kpi.employeeId,
      },
      { status: 'REOPENED', lockedAt: null },
    );
    await this.audit.log({
      action: PerformanceAuditActionEnum.EMPLOYEE_KPI_REOPENED,
      actor,
      employeeId: kpi.employeeId,
      reason,
      beforeValues: before,
      afterValues: this.snapshot(saved),
    });
    return saved;
  }

  private async getKpi(actor: AuthenticatedUser, id: number) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const kpi = await this.kpis.findOne({
      where: { id, companyId },
      relations: { performancePeriod: true },
    });
    if (!kpi) throw new NotFoundException('Employee KPI not found.');
    if (kpi.status !== EmployeeKpiStatusEnum.APPROVED)
      throw new ConflictException('Only approved KPIs can be reviewed.');
    return kpi;
  }

  private async assertManager(actor: AuthenticatedUser, employeeId: number) {
    if (this.access.hasCompanyScope(actor)) return;
    const reportees = await this.access.getReportingEmployeeIds(actor);
    if (!reportees.includes(employeeId))
      throw new ForbiddenException('Employee is outside your reporting tree.');
  }

  private assertPhase(period: PerformancePeriod, kind: Kind) {
    if (!period.kpiPhase)
      throw new ConflictException(
        'This period has no KPI review cycle configured.',
      );
    if (period.kpiPhase === 'REOPENED') return;
    const allowed =
      kind === 'MID' ? ['MID_REVIEW', 'IN_PROGRESS'] : ['FINAL_REVIEW'];
    if (!allowed.includes(period.kpiPhase))
      throw new ConflictException('This KPI review window is not open.');
    if (
      kind === 'MID' &&
      kpiCycleToday() < (period.midCycleReviewDate ?? '9999-12-31')
    )
      throw new ConflictException('Mid-cycle review has not started.');
  }

  private assertKind(kind: string): asserts kind is Kind {
    if (kind !== 'MID' && kind !== 'FINAL')
      throw new BadRequestException('Review kind must be MID or FINAL.');
  }

  private async ensureReview(kpi: EmployeeKpi, kind: Kind) {
    let review = await this.reviews.findOneBy({
      companyId: kpi.companyId,
      employeeKpiId: kpi.id,
      kind,
    });
    if (review) return review;
    await this.reviews
      .createQueryBuilder()
      .insert()
      .into(EmployeeKpiCycleReview)
      .values({
        companyId: kpi.companyId,
        performancePeriodId: kpi.performancePeriodId,
        employeeId: kpi.employeeId,
        employeeKpiId: kpi.id,
        kind,
        status: 'PENDING',
      })
      .orIgnore()
      .execute();
    review = await this.reviews.findOneBy({
      companyId: kpi.companyId,
      employeeKpiId: kpi.id,
      kind,
    });
    return review!;
  }

  private async weightedScore(
    kpi: EmployeeKpi,
    review: EmployeeKpiCycleReview,
  ): Promise<string> {
    const weight = new Decimal(kpi.weight);
    const cap = new Decimal(kpi.performancePeriod.scoreCap).div(100);
    const config = kpi.formulaConfig ?? {};
    const managerRating = new Decimal(review.managerRating ?? 0);
    const maxScale = new Decimal(Number(config.max_scale ?? 5));
    if (maxScale.lte(0))
      throw new BadRequestException('Rating scale maximum must be positive.');
    const ratingRatio = managerRating.div(maxScale);
    const actualText = (await this.progress.calculate(kpi)).actualValue;
    const actual = actualText === null ? null : new Decimal(actualText);
    let numericRatio: Decimal;
    if (kpi.scoringType === 'RATING_SCALE') {
      numericRatio = ratingRatio;
    } else if (kpi.scoringType === 'MILESTONE') {
      const total = new Decimal(
        Number(config.total_milestones ?? kpi.targetValue ?? 0),
      );
      if (!actual || total.lte(0))
        throw new BadRequestException(
          'Milestone completion and a positive total are required.',
        );
      numericRatio = actual.div(total);
    } else {
      if (actual === null || kpi.targetValue === null)
        throw new BadRequestException(
          'Actual and target values are required before finalization.',
        );
      const target = new Decimal(kpi.targetValue);
      if (kpi.measurementDirection === 'LOWER_IS_BETTER') {
        numericRatio = actual.eq(0) ? cap : target.div(actual);
      } else if (kpi.measurementDirection === 'TARGET_MATCH') {
        numericRatio = target.eq(actual)
          ? new Decimal(1)
          : target.eq(0) || actual.eq(0)
            ? new Decimal(0)
            : Decimal.min(actual.div(target), target.div(actual));
      } else {
        numericRatio = target.eq(0)
          ? actual.eq(0)
            ? new Decimal(1)
            : new Decimal(0)
          : actual.div(target);
      }
      if (kpi.scoringType === 'MIXED') {
        const share = new Decimal(Number(config.numeric_share ?? 0.5));
        if (share.lt(0) || share.gt(1))
          throw new BadRequestException(
            'Mixed scoring numeric_share must be between 0 and 1.',
          );
        numericRatio = numericRatio
          .mul(share)
          .plus(ratingRatio.mul(new Decimal(1).minus(share)));
      }
    }
    return Decimal.min(Decimal.max(numericRatio, 0), cap)
      .mul(weight)
      .toDecimalPlaces(4)
      .toFixed(4);
  }

  private async lockEmployeeScoreIfComplete(
    actor: AuthenticatedUser,
    period: PerformancePeriod,
    employeeId: number,
  ) {
    const kpis = await this.kpis.find({
      where: {
        companyId: period.companyId,
        performancePeriodId: period.id,
        employeeId,
        status: EmployeeKpiStatusEnum.APPROVED,
      },
    });
    if (!kpis.length) return;
    const reviews = await this.reviews.find({
      where: {
        companyId: period.companyId,
        performancePeriodId: period.id,
        employeeId,
        kind: 'FINAL',
      },
    });
    if (
      kpis.some(
        (kpi) =>
          !reviews.some(
            (review) =>
              review.employeeKpiId === kpi.id && review.status === 'FINALIZED',
          ),
      )
    )
      return;
    const total = Decimal.min(
      reviews.reduce(
        (sum, review) => sum.plus(review.weightedScore ?? 0),
        new Decimal(0),
      ),
      new Decimal(period.scoreCap),
    );
    const bands = period.kpiRatingBands?.length
      ? period.kpiRatingBands
      : [
          { label: 'Outstanding', min: 110 },
          { label: 'Exceeds', min: 90 },
          { label: 'Meets', min: 70 },
          { label: 'Below', min: 50 },
          { label: 'Poor', min: 0 },
        ];
    const rating =
      [...bands]
        .sort((a, b) => b.min - a.min)
        .find((band) => total.gte(band.min))?.label ??
      bands[bands.length - 1].label;
    const existing = await this.scores.findOneBy({
      companyId: period.companyId,
      performancePeriodId: period.id,
      employeeId,
    });
    const before = existing
      ? {
          score: existing.totalWeightedScore,
          rating: existing.finalRatingBand,
          revision: existing.revision,
        }
      : null;
    const now = new Date();
    const score = await this.scores.save(
      this.scores.create({
        ...(existing ?? {}),
        companyId: period.companyId,
        performancePeriodId: period.id,
        employeeId,
        totalWeightedScore: total.toDecimalPlaces(4).toFixed(4),
        finalRatingBand: rating,
        status: 'LOCKED',
        finalizedAt: now,
        lockedAt: now,
        revision: existing ? existing.revision + 1 : 1,
      }),
    );
    await this.audit.log({
      action: PerformanceAuditActionEnum.EMPLOYEE_KPI_SCORE_LOCKED,
      actor,
      employeeId,
      beforeValues: before,
      afterValues: {
        score: score.totalWeightedScore,
        rating: score.finalRatingBand,
        revision: score.revision,
      },
    });
    const event: KpiFinalScoreLockedEvent = {
      cycleId: period.id,
      companyId: period.companyId,
      employeeId,
      totalWeightedScore: score.totalWeightedScore,
      finalRatingBand: rating,
      finalizedAt: now.toISOString(),
      occurredAt: now.toISOString(),
    };
    this.events.emit(KPI_DOMAIN_EVENTS.FINAL_SCORE_LOCKED, event);
  }

  private snapshot(review: EmployeeKpiCycleReview) {
    return {
      id: review.id,
      employee_kpi_id: review.employeeKpiId,
      kind: review.kind,
      status: review.status,
      self_rating: review.selfRating,
      manager_rating: review.managerRating,
      weighted_score: review.weightedScore,
      manager_on_behalf: review.managerOnBehalf,
      finalized_at: review.finalizedAt?.toISOString() ?? null,
    };
  }
}
