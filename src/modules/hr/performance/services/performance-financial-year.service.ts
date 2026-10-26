import { assertDateRange } from '../utils/workflow-validation';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { PerformanceFinancialYear } from '../entities/performance-financial-year.entity';
import { CreatePerformanceFinancialYearDto } from '../dto/create-performance-financial-year.dto';
import { PerformanceAuditService } from './performance-audit.service';
import { PerformanceAggregationMethodEnum } from '../enums/performance-aggregation-method.enum';
import { validateAnnualAggregationConfiguration } from './performance-annual-aggregation.calculator';

@Injectable()
export class PerformanceFinancialYearService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PerformanceAuditService,
    @InjectRepository(PerformanceFinancialYear)
    private readonly financialYearRepository: Repository<PerformanceFinancialYear>,
  ) {}

  async create(
    actor: AuthenticatedUser,
    dto: CreatePerformanceFinancialYearDto,
  ): Promise<PerformanceFinancialYear> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    assertDateRange(dto.start_date, dto.end_date, 'Financial year');

    if (dto.start_date > dto.end_date) {
      throw new BadRequestException(
        'Financial year start date must be before or equal to the end date.',
      );
    }

    const annualAggregationMethod =
      dto.annual_aggregation_method ??
      PerformanceAggregationMethodEnum.SIMPLE_MONTHLY_AVERAGE;
    if (
      annualAggregationMethod !==
      PerformanceAggregationMethodEnum.SIMPLE_MONTHLY_AVERAGE
    ) {
      throw new BadRequestException(
        'The approved Module 10 policy uses a simple average of scored published months.',
      );
    }
    const aggregationConfiguration = dto.aggregation_configuration ?? null;
    validateAnnualAggregationConfiguration(
      annualAggregationMethod,
      aggregationConfiguration,
    );

    const overlap = await this.financialYearRepository
      .createQueryBuilder('year')
      .where('year.company_id = :companyId', { companyId })
      .andWhere('year.start_date <= :endDate', { endDate: dto.end_date })
      .andWhere('year.end_date >= :startDate', { startDate: dto.start_date })
      .getOne();

    if (overlap) {
      throw new ConflictException(
        'Financial year dates overlap an existing performance financial year.',
      );
    }

    const financialYear = await this.financialYearRepository.save(
      this.financialYearRepository.create({
        companyId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        startDate: dto.start_date,
        endDate: dto.end_date,
        status: 'DRAFT',
        annualAggregationMethod,
        aggregationConfiguration,
        lockedByCompanyUserId: null,
      }),
    );

    await this.auditService.log({
      action: PerformanceAuditActionEnum.FINANCIAL_YEAR_CREATED,
      actor,
      afterValues: {
        financial_year_id: financialYear.id,
        code: financialYear.code,
      },
    });

    return financialYear;
  }

  async list(actor: AuthenticatedUser): Promise<PerformanceFinancialYear[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    return this.financialYearRepository.find({
      where: { companyId },
      order: { startDate: 'DESC', id: 'DESC' },
    });
  }
}
