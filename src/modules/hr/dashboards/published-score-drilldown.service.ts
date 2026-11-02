import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hasPermission } from '../../../common/utils/permission.util';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../shared/hr-access.service';
import { PerformanceReview } from '../performance/entities/performance-review.entity';
import { PerformancePeriod } from '../performance/entities/performance-period.entity';
import { PerformanceReviewStatusEnum } from '../performance/enums/performance-review-status.enum';
import { PerformancePeriodTypeEnum } from '../performance/enums/performance-period-type.enum';
import { Employee } from '../employees/entities/employee.entity';
import { PublishedScoreDrilldownQueryDto } from './dtos/published-score-drilldown-query.dto';
import { buildDashboardEmployeeSubquery } from './dashboard-employee-scope';

@Injectable()
export class PublishedScoreDrilldownService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(PerformanceReview)
    private readonly reviewRepository: Repository<PerformanceReview>,
  ) {}

  async getPage(
    actor: AuthenticatedUser,
    query: PublishedScoreDrilldownQueryDto,
  ) {
    if (!hasPermission(actor.permissions, 'performance_aggregates:read')) {
      throw new ForbiddenException('Performance aggregate access is required');
    }
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const dateFrom = new Date(query.date_from);
    const dateTo = new Date(query.date_to);
    if (
      Number.isNaN(dateFrom.valueOf()) ||
      Number.isNaN(dateTo.valueOf()) ||
      dateFrom > dateTo
    ) {
      throw new BadRequestException('A valid ordered date range is required');
    }

    const accessScope =
      await this.hrAccessService.getAccessibleEmployeeSqlScope(actor);
    if (
      !accessScope.companyWide &&
      accessScope.actorEmployeeId === null &&
      !accessScope.branchIds.length &&
      !accessScope.departmentIds.length &&
      accessScope.managerEmployeeId === null
    ) {
      return this.emptyPage(query);
    }
    const employeeScope = buildDashboardEmployeeSubquery(
      companyId,
      query,
      accessScope,
    );

    const effectiveType = query.period_type as PerformancePeriodTypeEnum;
    const periodQuery = this.reviewRepository
      .createQueryBuilder('review')
      .innerJoin(
        PerformancePeriod,
        'period',
        'period.id = review.performance_period_id AND period.company_id = review.company_id',
      )
      .where('review.company_id = :companyId', { companyId })
      .andWhere('review.status = :status', {
        status: PerformanceReviewStatusEnum.PUBLISHED,
      })
      .andWhere('period.period_type = :periodType', {
        periodType: effectiveType,
      })
      .andWhere('period.end_date >= :dateFrom', {
        dateFrom: query.date_from,
      })
      .andWhere('period.start_date <= :dateTo', { dateTo: query.date_to });
    if (query.period_id) {
      periodQuery.andWhere('period.id = :periodId', {
        periodId: query.period_id,
      });
    }
    if (query.rating_band_id === 0) {
      periodQuery.andWhere('review.rating_band_id IS NULL');
    } else if (query.rating_band_id) {
      periodQuery.andWhere('review.rating_band_id = :ratingBandId', {
        ratingBandId: query.rating_band_id,
      });
    }
    if (query.score_state === 'scored') {
      periodQuery.andWhere('review.final_score IS NOT NULL');
    } else if (query.score_state === 'unscored') {
      periodQuery.andWhere('review.final_score IS NULL');
    }

    const total = await periodQuery
      .clone()
      .andWhere(`review.employee_id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params)
      .getCount();
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const items = await periodQuery
      .clone()
      .innerJoin(Employee, 'employee', 'employee.id = review.employee_id')
      .andWhere(`review.employee_id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params)
      .select('review.id', 'review_id')
      .addSelect('review.employee_id', 'employee_id')
      .addSelect('employee.employee_no', 'employee_no')
      .addSelect(
        `CONCAT_WS(' ', employee.first_name, NULLIF(employee.middle_name, ''), employee.last_name)`,
        'employee_name',
      )
      .addSelect('review.performance_period_id', 'period_id')
      .addSelect('period.name', 'period_name')
      .addSelect('period.period_type', 'period_type')
      .addSelect('period.start_date', 'period_start')
      .addSelect('period.end_date', 'period_end')
      .addSelect('review.final_score', 'final_score')
      .addSelect('review.rating_code', 'rating_code')
      .addSelect('review.published_at', 'published_at')
      .orderBy('period.start_date', 'DESC')
      .addOrderBy('review.final_score', 'DESC', 'NULLS LAST')
      .addOrderBy('review.employee_id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawMany<Record<string, string | number | null>>();

    return {
      generated_at: new Date().toISOString(),
      filters: {
        date_from: query.date_from,
        date_to: query.date_to,
        period_type: query.period_type,
        period_id: query.period_id ?? null,
        rating_band_id: query.rating_band_id ?? null,
        score_state: query.score_state,
        branch_id: query.branch_id ?? null,
        department_id: query.department_id ?? null,
        employee_id: query.employee_id ?? null,
      },
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
      items: items.map((row) => ({
        review_id: Number(row.review_id),
        employee_id: Number(row.employee_id),
        employee_no: row.employee_no,
        employee_name: row.employee_name,
        period_id: Number(row.period_id),
        period_name: row.period_name,
        period_type: row.period_type,
        period_start: row.period_start,
        period_end: row.period_end,
        final_score: row.final_score === null ? null : Number(row.final_score),
        rating_code: row.rating_code,
        published_at: row.published_at,
      })),
    };
  }

  private emptyPage(query: PublishedScoreDrilldownQueryDto) {
    const limit = Math.min(100, Math.max(1, query.limit));
    return {
      generated_at: new Date().toISOString(),
      filters: {
        date_from: query.date_from,
        date_to: query.date_to,
        period_type: query.period_type,
        period_id: query.period_id ?? null,
        rating_band_id: query.rating_band_id ?? null,
        score_state: query.score_state,
        branch_id: query.branch_id ?? null,
        department_id: query.department_id ?? null,
        employee_id: query.employee_id ?? null,
      },
      pagination: {
        page: Math.max(1, query.page),
        limit,
        total: 0,
        total_pages: 0,
      },
      items: [],
    };
  }
}
