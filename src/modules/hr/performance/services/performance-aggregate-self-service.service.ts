import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { PerformanceAggregate } from '../entities/performance-aggregate.entity';
import { PerformanceFinancialYear } from '../entities/performance-financial-year.entity';

@Injectable()
export class PerformanceAggregateSelfService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(PerformanceAggregate)
    private readonly aggregateRepository: Repository<PerformanceAggregate>,
    @InjectRepository(PerformanceFinancialYear)
    private readonly financialYearRepository: Repository<PerformanceFinancialYear>,
  ) {}

  async listOwn(actor: AuthenticatedUser) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.employeeId) {
      throw new ForbiddenException('An employee profile is required.');
    }

    const aggregates = await this.aggregateRepository.find({
      where: {
        companyId,
        employeeId: actor.employeeId,
        publishedAt: Not(IsNull()),
      },
      order: {
        financialYearId: 'ASC',
        periodType: 'ASC',
        sequenceNumber: 'ASC',
      },
    });
    const financialYearIds = Array.from(
      new Set(aggregates.map((aggregate) => aggregate.financialYearId)),
    );
    const financialYears = financialYearIds.length
      ? await this.financialYearRepository.find({
          where: { companyId, id: In(financialYearIds) },
        })
      : [];
    const financialYearById = new Map(
      financialYears.map((financialYear) => [financialYear.id, financialYear]),
    );

    // Return an employee-safe projection. Calculation snapshots can contain
    // internal source identifiers and are intentionally kept out of ESS.
    return aggregates.map((aggregate) => ({
      id: aggregate.id,
      financial_year_id: aggregate.financialYearId,
      financial_year_code:
        financialYearById.get(aggregate.financialYearId)?.code ?? null,
      financial_year_name:
        financialYearById.get(aggregate.financialYearId)?.name ?? null,
      financial_year_start:
        financialYearById.get(aggregate.financialYearId)?.startDate ?? null,
      financial_year_end:
        financialYearById.get(aggregate.financialYearId)?.endDate ?? null,
      period_type: aggregate.periodType,
      sequence_number: aggregate.sequenceNumber,
      name: aggregate.name,
      aggregation_method: aggregate.aggregationMethod,
      aggregate_score: aggregate.aggregateScore,
      rating_code: aggregate.ratingCode,
      published_at: aggregate.publishedAt,
    }));
  }
}
