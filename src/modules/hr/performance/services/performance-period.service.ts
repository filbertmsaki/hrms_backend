import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { PerformancePeriodStatusEnum } from '../enums/performance-period-status.enum';
import { PerformanceFinancialYear } from '../entities/performance-financial-year.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import { PerformanceAuditService } from './performance-audit.service';
import { PerformancePeriodFactory } from '../utils/performance-period-factory';
import {
  CreatePerformancePeriodDto,
  PerformancePeriodQueryDto,
  UpdatePerformancePeriodDto,
} from '../dto/performance-period.dto';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { NotificationsService } from '../../../notifications/notifications.service';
import { NotificationCategoryEnum } from '../../../notifications/enums/notification-category.enum';
import { NotificationPriorityEnum } from '../../../notifications/enums/notification-priority.enum';

@Injectable()
export class PerformancePeriodService {
  private readonly logger = new Logger(PerformancePeriodService.name);
  private readonly periodFactory = new PerformancePeriodFactory();

  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PerformanceAuditService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    @InjectRepository(PerformanceFinancialYear)
    private readonly financialYearRepository: Repository<PerformanceFinancialYear>,
    @InjectRepository(PerformancePeriod)
    private readonly periodRepository: Repository<PerformancePeriod>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: PerformancePeriodQueryDto = {},
  ): Promise<PerformancePeriod[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const qb = this.periodRepository
      .createQueryBuilder('period')
      .where('period.companyId = :companyId', { companyId });

    if (query.status) {
      qb.andWhere('period.status = :status', { status: query.status });
    }
    if (query.date_from) {
      qb.andWhere('period.endDate >= :dateFrom', { dateFrom: query.date_from });
    }
    if (query.date_to) {
      qb.andWhere('period.startDate <= :dateTo', { dateTo: query.date_to });
    }
    if (query.created_by_company_user_id) {
      qb.andWhere('period.createdByCompanyUserId = :creatorId', {
        creatorId: query.created_by_company_user_id,
      });
    }

    return qb
      .orderBy('period.startDate', 'DESC')
      .addOrderBy('period.sequenceNumber', 'DESC')
      .getMany();
  }

  async get(actor: AuthenticatedUser, id: number): Promise<PerformancePeriod> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const period = await this.periodRepository.findOne({
      where: { id, companyId },
    });
    if (!period) {
      throw new NotFoundException('Performance period not found.');
    }
    return period;
  }

  async create(
    actor: AuthenticatedUser,
    dto: CreatePerformancePeriodDto,
  ): Promise<PerformancePeriod> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    this.validateDateRange(dto.start_date, dto.end_date);
    const financialYear = await this.financialYearRepository.findOne({
      where: { id: dto.financial_year_id, companyId },
    });
    if (!financialYear) {
      throw new NotFoundException('Performance financial year not found.');
    }
    if (financialYear.isLocked) {
      throw new ConflictException('The performance financial year is locked.');
    }
    if (
      dto.start_date < financialYear.startDate ||
      dto.end_date > financialYear.endDate
    ) {
      throw new BadRequestException(
        'Performance period dates must fall within the financial year.',
      );
    }

    const period = await this.periodRepository.save(
      this.periodRepository.create({
        companyId,
        financialYearId: financialYear.id,
        periodType: dto.period_type,
        sequenceNumber: dto.sequence_number,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        createdByCompanyUserId: actor.companyMembershipId ?? null,
        startDate: dto.start_date,
        endDate: dto.end_date,
        status: PerformancePeriodStatusEnum.DRAFT,
        achievementEntryOpensAt: null,
        achievementEntryClosesAt: null,
        selfReviewDueAt: null,
        managerReviewDueAt: null,
        hrReviewDueAt: null,
        generationSnapshot: { manually_created: true },
      }),
    );
    await this.auditService.log({
      action: PerformanceAuditActionEnum.PERIOD_CREATED,
      actor,
      afterValues: this.periodAuditSnapshot(period),
    });
    return period;
  }

  async update(
    actor: AuthenticatedUser,
    id: number,
    dto: UpdatePerformancePeriodDto,
  ): Promise<PerformancePeriod> {
    const period = await this.get(actor, id);
    if (period.status !== PerformancePeriodStatusEnum.DRAFT) {
      throw new ConflictException(
        'Only draft performance periods can be edited.',
      );
    }
    const startDate = dto.start_date ?? period.startDate;
    const endDate = dto.end_date ?? period.endDate;
    this.validateDateRange(startDate, endDate);
    const financialYearId = dto.financial_year_id ?? period.financialYearId;
    const financialYear = await this.financialYearRepository.findOne({
      where: { id: financialYearId, companyId: period.companyId },
    });
    if (!financialYear) {
      throw new NotFoundException('Performance financial year not found.');
    }
    if (
      startDate < financialYear.startDate ||
      endDate > financialYear.endDate
    ) {
      throw new BadRequestException(
        'Performance period dates must fall within the financial year.',
      );
    }
    const before = this.periodAuditSnapshot(period);
    period.financialYearId = financialYearId;
    period.periodType = dto.period_type ?? period.periodType;
    period.sequenceNumber = dto.sequence_number ?? period.sequenceNumber;
    period.name = dto.name?.trim() ?? period.name;
    period.description =
      dto.description === undefined
        ? period.description
        : dto.description.trim() || null;
    period.startDate = startDate;
    period.endDate = endDate;
    const saved = await this.periodRepository.save(period);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.PERIOD_UPDATED,
      actor,
      beforeValues: before,
      afterValues: this.periodAuditSnapshot(saved),
    });
    return saved;
  }

  async activate(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<PerformancePeriod> {
    const period = await this.get(actor, id);
    if (period.status !== PerformancePeriodStatusEnum.DRAFT) {
      throw new ConflictException('Only a draft period can be activated.');
    }
    period.status = PerformancePeriodStatusEnum.OPEN;
    period.achievementEntryOpensAt ??= new Date();
    const saved = await this.periodRepository.save(period);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.PERIOD_ACTIVATED,
      actor,
      afterValues: this.periodAuditSnapshot(saved),
    });
    void this.notifyPeriodActivated(saved, actor);
    return saved;
  }

  async close(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<PerformancePeriod> {
    const period = await this.get(actor, id);
    if (period.status === PerformancePeriodStatusEnum.DRAFT) {
      throw new ConflictException(
        'A draft performance period must be activated before it can be closed.',
      );
    }
    if (
      [
        PerformancePeriodStatusEnum.LOCKED,
        PerformancePeriodStatusEnum.CANCELLED,
      ].includes(period.status)
    ) {
      throw new ConflictException('The performance period is already closed.');
    }
    const before = this.periodAuditSnapshot(period);
    period.status = PerformancePeriodStatusEnum.LOCKED;
    period.lockedAt = new Date();
    const saved = await this.periodRepository.save(period);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.PERIOD_CLOSED,
      actor,
      beforeValues: before,
      afterValues: this.periodAuditSnapshot(saved),
    });
    return saved;
  }

  async generatePeriods(
    financialYearId: number,
    actor: AuthenticatedUser,
  ): Promise<PerformancePeriod[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const financialYear = await this.financialYearRepository.findOne({
      where: { id: financialYearId, companyId },
    });

    if (!financialYear) {
      throw new NotFoundException('Performance financial year not found.');
    }

    if (financialYear.isLocked) {
      throw new ConflictException(
        'Locked financial years cannot be regenerated.',
      );
    }

    const monthlyPeriods = this.periodFactory.buildMonthlyPeriods(
      financialYear.startDate,
      financialYear.endDate,
    );
    const quarterlyPeriods =
      this.periodFactory.buildQuarterlyPeriods(monthlyPeriods);
    const periodTemplates = [...monthlyPeriods, ...quarterlyPeriods];

    const existing = await this.periodRepository.find({
      where: { financialYearId },
    });
    const existingKeys = new Set(
      existing.map((period) => `${period.periodType}:${period.sequenceNumber}`),
    );

    const selfReviewDays = this.configService.get<number>(
      'PERFORMANCE_DEFAULT_SELF_REVIEW_DAYS',
      3,
    );
    const managerReviewDays = this.configService.get<number>(
      'PERFORMANCE_DEFAULT_MANAGER_REVIEW_DAYS',
      5,
    );
    const hrReviewDays = this.configService.get<number>(
      'PERFORMANCE_DEFAULT_HR_REVIEW_DAYS',
      3,
    );

    const created = await this.periodRepository.save(
      periodTemplates
        .filter(
          (period) =>
            !existingKeys.has(`${period.periodType}:${period.sequenceNumber}`),
        )
        .map((period) => {
          const end = new Date(`${period.endDate}T00:00:00.000Z`);
          const openAt = new Date(end);
          openAt.setUTCDate(openAt.getUTCDate() + 1);

          const selfReviewDueAt = new Date(openAt);
          selfReviewDueAt.setUTCDate(
            selfReviewDueAt.getUTCDate() + selfReviewDays,
          );

          const managerReviewDueAt = new Date(selfReviewDueAt);
          managerReviewDueAt.setUTCDate(
            managerReviewDueAt.getUTCDate() + managerReviewDays,
          );

          const hrReviewDueAt = new Date(managerReviewDueAt);
          hrReviewDueAt.setUTCDate(hrReviewDueAt.getUTCDate() + hrReviewDays);

          return this.periodRepository.create({
            companyId,
            financialYearId,
            periodType: period.periodType,
            sequenceNumber: period.sequenceNumber,
            name: period.name,
            description: null,
            createdByCompanyUserId: actor.companyMembershipId ?? null,
            startDate: period.startDate,
            endDate: period.endDate,
            status: PerformancePeriodStatusEnum.DRAFT,
            achievementEntryOpensAt: openAt,
            achievementEntryClosesAt: selfReviewDueAt,
            selfReviewDueAt,
            managerReviewDueAt,
            hrReviewDueAt,
            generationSnapshot: period.generationSnapshot,
          });
        }),
    );

    await this.auditService.log({
      action: PerformanceAuditActionEnum.PERIODS_GENERATED,
      actor,
      afterValues: {
        financial_year_id: financialYearId,
        created_periods: created.map((period) => ({
          id: period.id,
          period_type: period.periodType,
          sequence_number: period.sequenceNumber,
        })),
      },
    });

    return this.periodRepository.find({
      where: { financialYearId },
      order: { startDate: 'ASC', sequenceNumber: 'ASC' },
    });
  }

  private validateDateRange(startDate: string, endDate: string): void {
    if (endDate <= startDate) {
      throw new BadRequestException('end_date must be later than start_date.');
    }
  }

  private periodAuditSnapshot(period: PerformancePeriod) {
    return {
      id: period.id,
      financial_year_id: period.financialYearId,
      name: period.name,
      start_date: period.startDate,
      end_date: period.endDate,
      status: period.status,
      version: period.version,
    };
  }

  private async notifyPeriodActivated(
    period: PerformancePeriod,
    actor: AuthenticatedUser,
  ): Promise<void> {
    try {
      const employees = await this.employeeRepository.find({
        where: {
          company_id: period.companyId,
          employment_status: EmploymentStatusEnum.ACTIVE,
        },
        select: ['id', 'company_user_id'],
      });
      await this.notificationsService.createAndPushMany(
        employees
          .filter((employee) => employee.company_user_id != null)
          .map((employee) => ({
            company_id: period.companyId,
            sender_company_user_id: actor.companyMembershipId ?? null,
            receiver_company_user_id: employee.company_user_id!,
            category: NotificationCategoryEnum.HR,
            priority: NotificationPriorityEnum.MEDIUM,
            title: 'Performance period opened',
            message: `${period.name} is now open for KPI proposals.`,
            related_module: 'PERFORMANCE',
            entity_type: 'PERFORMANCE_PERIOD',
            entity_id: period.id,
            action_url: '/dashboard/me/performance/kpis',
            dedupe_key: `performance-period-open:${period.id}:${employee.id}`,
          })),
      );
    } catch (error) {
      this.logger.warn(
        `Performance period ${period.id} was activated, but notifications failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
