import {
  ConflictException,
  Injectable,
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

@Injectable()
export class PerformancePeriodService {
  private readonly periodFactory = new PerformancePeriodFactory();

  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PerformanceAuditService,
    private readonly configService: ConfigService,
    @InjectRepository(PerformanceFinancialYear)
    private readonly financialYearRepository: Repository<PerformanceFinancialYear>,
    @InjectRepository(PerformancePeriod)
    private readonly periodRepository: Repository<PerformancePeriod>,
  ) {}

  async list(actor: AuthenticatedUser): Promise<PerformancePeriod[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.periodRepository.find({
      where: { companyId },
      order: { startDate: 'DESC', sequenceNumber: 'DESC' },
    });
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
    const quarterlyPeriods = this.periodFactory.buildQuarterlyPeriods(
      monthlyPeriods,
    );
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
}
