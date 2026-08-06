import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { PerformanceAggregate } from '../../../hr/performance/entities/performance-aggregate.entity';
import { PerformancePeriodTypeEnum } from '../../../hr/performance/enums/performance-period-type.enum';
import { PerformanceReview } from '../../../hr/performance/entities/performance-review.entity';
import { PerformanceReviewStatusEnum } from '../../../hr/performance/enums/performance-review-status.enum';
import {
  ReportRunner,
  ReportRunnerContext,
  ReportRunnerResult,
} from '../../interfaces/report-runner.interface';

@Injectable()
export class PerformanceSummaryReportRunner implements ReportRunner {
  readonly reportCode = 'PERFORMANCE_SUMMARY';

  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(PerformanceReview)
    private readonly reviewRepository: Repository<PerformanceReview>,
    @InjectRepository(PerformanceAggregate)
    private readonly aggregateRepository: Repository<PerformanceAggregate>,
  ) {}

  async generate(context: ReportRunnerContext): Promise<ReportRunnerResult> {
    const employeeRows = await this.employeeRepository
      .createQueryBuilder('employee')
      .select('employee.id', 'id')
      .addSelect('employee.employee_no', 'employeeNumber')
      .addSelect('employee.first_name', 'firstName')
      .addSelect('employee.last_name', 'lastName')
      .where('employee.company_id = :companyId', { companyId: context.companyId })
      .orderBy('employee.employee_no', 'ASC')
      .getRawMany<{
        id: number;
        employeeNumber: string;
        firstName: string;
        lastName: string;
      }>();

    const reviews = await this.reviewRepository.find({
      where: {
        companyId: context.companyId,
        status: PerformanceReviewStatusEnum.PUBLISHED,
      },
      order: { id: 'DESC' },
    });

    const annualAggregates = await this.aggregateRepository.find({
      where: {
        companyId: context.companyId,
        periodType: PerformancePeriodTypeEnum.ANNUAL,
      },
      order: { updatedAt: 'DESC', id: 'DESC' },
    });

    const latestReviewByEmployee = new Map<number, PerformanceReview>();
    for (const review of reviews) {
      if (!latestReviewByEmployee.has(review.employeeId)) {
        latestReviewByEmployee.set(review.employeeId, review);
      }
    }

    const latestAnnualAggregateByEmployee = new Map<number, PerformanceAggregate>();
    for (const aggregate of annualAggregates) {
      if (!latestAnnualAggregateByEmployee.has(aggregate.employeeId)) {
        latestAnnualAggregateByEmployee.set(aggregate.employeeId, aggregate);
      }
    }

    const lines = [
      [
        'Employee Number',
        'Employee Name',
        'Latest Review Score',
        'Latest Review Rating',
        'Annual Aggregate Score',
        'Annual Aggregate Rating',
      ].join(','),
    ];

    for (const employee of employeeRows) {
      const review = latestReviewByEmployee.get(Number(employee.id));
      const aggregate = latestAnnualAggregateByEmployee.get(Number(employee.id));
      lines.push(
        [
          employee.employeeNumber,
          `${employee.firstName} ${employee.lastName}`,
          review?.finalScore ?? '',
          review?.ratingCode ?? '',
          aggregate?.aggregateScore ?? '',
          aggregate?.ratingCode ?? '',
        ]
          .map((value) => this.escapeCsvCell(String(value ?? '')))
          .join(','),
      );
    }

    const buffer = Buffer.from(lines.join('\r\n'), 'utf8');
    const filename = context.filenamePattern
      .replace(/\{\{\s*reportDate\s*\}\}/g, context.dateTo ?? 'export')
      .replace(/\.(xlsx|pdf)$/i, '.csv');

    return {
      filename,
      mimeType: 'text/csv',
      buffer,
      recordCount: employeeRows.length,
    };
  }

  private escapeCsvCell(value: string): string {
    if (!/[",\r\n]/.test(value)) {
      return value;
    }

    return `"${value.replace(/"/g, '""')}"`;
  }
}
