import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DataSource, EntitySchema } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { PerformanceAggregate } from '../entities/performance-aggregate.entity';
import { PerformanceFinancialYear } from '../entities/performance-financial-year.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import { PerformanceReview } from '../entities/performance-review.entity';
import { PerformanceAggregationMethodEnum as Method } from '../enums/performance-aggregation-method.enum';
import { PerformancePeriodTypeEnum as PeriodType } from '../enums/performance-period-type.enum';
import { PerformanceReviewStatusEnum as ReviewStatus } from '../enums/performance-review-status.enum';
import { PerformanceAggregationService } from './performance-aggregation.service';
import { PerformanceAuditService } from './performance-audit.service';
import { PerformanceSummaryReportRunner } from '../../../scheduled-reporting/services/runners/performance-summary-report-runner.service';
import { ReportOutputFormatEnum } from '../../../scheduled-reporting/enums/report-output-format.enum';

const databaseUrl =
  process.env.HRMS_PERFORMANCE_TEST_DATABASE_URL ??
  process.env.HRMS_WORKFLOW_TEST_DATABASE_URL;
const postgresSuite = databaseUrl ? describe : describe.skip;

postgresSuite('performance annual aggregation with real PostgreSQL', () => {
  const schema = `hrms_aggregate_${randomUUID().replace(/-/g, '')}`;
  let source: DataSource;
  let service: PerformanceAggregationService;
  let performanceSummaryRunner: PerformanceSummaryReportRunner;
  const auditLog = jest.fn().mockResolvedValue(undefined);
  const actor: AuthenticatedUser = {
    id: 1,
    email: 'hr@example.test',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 1,
    companyMembershipId: 1,
    employeeId: 1,
    roles: [],
    permissions: [],
  };

  beforeAll(async () => {
    const databaseName = new URL(databaseUrl!).pathname.replace(/^\//, '');
    if (!databaseName.endsWith('_e2e') && !databaseName.endsWith('_test_db')) {
      throw new Error('A dedicated _e2e or _test_db database is required.');
    }
    const financialYears = new EntitySchema<PerformanceFinancialYear>({
      name: 'PerformanceFinancialYear',
      target: PerformanceFinancialYear,
      tableName: 'performance_financial_years',
      schema,
      columns: {
        id: { type: Number, primary: true },
        companyId: { type: Number },
        code: { type: String },
        name: { type: String },
        startDate: { type: 'date' },
        endDate: { type: 'date' },
        status: { type: String },
        annualAggregationMethod: { type: String },
        aggregationConfiguration: { type: 'jsonb', nullable: true },
        isLocked: { type: Boolean, default: false },
        lockedAt: { type: 'timestamptz', nullable: true },
        lockedByCompanyUserId: { type: Number, nullable: true },
        version: { type: Number, version: true },
        createdAt: { type: 'timestamptz', createDate: true },
        updatedAt: { type: 'timestamptz', updateDate: true },
      },
    });
    const periods = new EntitySchema<PerformancePeriod>({
      name: 'PerformancePeriod',
      target: PerformancePeriod,
      tableName: 'performance_periods',
      schema,
      columns: {
        id: { type: Number, primary: true },
        companyId: { type: Number },
        financialYearId: { type: Number },
        periodType: { type: String },
        sequenceNumber: { type: Number },
        name: { type: String },
        startDate: { type: 'date' },
        endDate: { type: 'date' },
      },
    });
    const reviews = new EntitySchema<PerformanceReview>({
      name: 'PerformanceReview',
      target: PerformanceReview,
      tableName: 'performance_reviews',
      schema,
      columns: {
        id: { type: Number, primary: true, generated: true },
        companyId: { type: Number },
        performancePeriodId: { type: Number },
        employeeId: { type: Number },
        status: { type: String },
        finalScore: { type: 'numeric', precision: 9, scale: 4, nullable: true },
        adjustmentScore: {
          type: 'numeric',
          precision: 9,
          scale: 4,
          default: 0,
        },
        calculationHash: { type: String, length: 128, nullable: true },
      },
    });
    const aggregates = new EntitySchema<PerformanceAggregate>({
      name: 'PerformanceAggregate',
      target: PerformanceAggregate,
      tableName: 'performance_aggregates',
      schema,
      columns: {
        id: { type: Number, primary: true, generated: true },
        companyId: { type: Number },
        employeeId: { type: Number },
        financialYearId: { type: Number },
        periodType: { type: String },
        sequenceNumber: { type: Number },
        name: { type: String },
        aggregationMethod: { type: String },
        aggregateScore: { type: 'numeric', precision: 9, scale: 4 },
        ratingCode: { type: String, nullable: true },
        sourceReviewHashes: { type: 'jsonb' },
        calculationSnapshot: { type: 'jsonb' },
        publishedAt: { type: 'timestamptz', nullable: true },
        lockedAt: { type: 'timestamptz', nullable: true },
        version: { type: Number, version: true },
        createdAt: { type: 'timestamptz', createDate: true },
        updatedAt: { type: 'timestamptz', updateDate: true },
      },
      uniques: [
        {
          columns: [
            'companyId',
            'employeeId',
            'financialYearId',
            'periodType',
            'sequenceNumber',
          ],
        },
      ],
    });
    const employees = new EntitySchema({
      name: 'Employee',
      tableName: 'employees',
      schema,
      columns: {
        id: { type: Number, primary: true },
        company_id: { type: Number },
        employee_no: { type: String },
        first_name: { type: String },
        last_name: { type: String },
      },
    });

    source = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema,
      entities: [financialYears, periods, reviews, aggregates, employees],
      synchronize: false,
      logging: false,
      extra: { options: `-c search_path=${schema},public` },
    });
    await source.initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.synchronize();

    service = new PerformanceAggregationService(
      { ensureActorCompanyId: () => 1 } as unknown as HrAccessService,
      {
        log: auditLog,
      } as unknown as PerformanceAuditService,
      source.getRepository(PerformanceFinancialYear),
      source.getRepository(PerformancePeriod),
      source.getRepository(PerformanceReview),
      source.getRepository(PerformanceAggregate),
    );
    performanceSummaryRunner = new PerformanceSummaryReportRunner(
      source.getRepository('Employee'),
      source.getRepository(PerformanceReview),
      source.getRepository(PerformanceAggregate),
    );

    await source.getRepository('Employee').save([
      {
        id: 7,
        company_id: 1,
        employee_no: 'DEMO-EMP-007',
        first_name: 'Amina',
        last_name: 'Demo',
      },
      {
        id: 8,
        company_id: 1,
        employee_no: 'DEMO-EMP-008',
        first_name: 'Baraka',
        last_name: 'Demo',
      },
    ]);

    await source.getRepository(PerformanceFinancialYear).save({
      id: 1,
      companyId: 1,
      code: 'FY2026',
      name: 'FY2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'ACTIVE',
      annualAggregationMethod: Method.SIMPLE_MONTHLY_AVERAGE,
      aggregationConfiguration: null,
    });
    await source.getRepository(PerformancePeriod).save([
      {
        id: 1,
        companyId: 1,
        financialYearId: 1,
        periodType: PeriodType.MONTHLY,
        sequenceNumber: 1,
        name: 'January',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
      {
        id: 2,
        companyId: 1,
        financialYearId: 1,
        periodType: PeriodType.MONTHLY,
        sequenceNumber: 2,
        name: 'February',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      },
      {
        id: 21,
        companyId: 1,
        financialYearId: 1,
        periodType: PeriodType.QUARTERLY,
        sequenceNumber: 1,
        name: 'Q1',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      },
      {
        id: 22,
        companyId: 1,
        financialYearId: 1,
        periodType: PeriodType.QUARTERLY,
        sequenceNumber: 2,
        name: 'Q2',
        startDate: '2026-04-01',
        endDate: '2026-06-30',
      },
    ]);
    await source.getRepository(PerformanceReview).save([
      {
        companyId: 1,
        performancePeriodId: 1,
        employeeId: 7,
        status: ReviewStatus.PUBLISHED,
        finalScore: '80.0000',
        adjustmentScore: '0.0000',
        calculationHash: 'm1',
      },
      {
        companyId: 1,
        performancePeriodId: 2,
        employeeId: 7,
        status: ReviewStatus.PUBLISHED,
        finalScore: '100.0000',
        adjustmentScore: '5.0000',
        calculationHash: 'm2',
      },
      {
        companyId: 1,
        performancePeriodId: 1,
        employeeId: 8,
        status: ReviewStatus.DRAFT,
        finalScore: '40.0000',
        adjustmentScore: '0.0000',
        calculationHash: 'draft',
      },
    ]);
    await source.getRepository(PerformanceAggregate).save([
      {
        companyId: 1,
        employeeId: 7,
        financialYearId: 1,
        periodType: PeriodType.QUARTERLY,
        sequenceNumber: 1,
        name: 'Q1',
        aggregationMethod: Method.SIMPLE_MONTHLY_AVERAGE,
        aggregateScore: '70.0000',
        ratingCode: null,
        sourceReviewHashes: ['q1'],
        calculationSnapshot: {},
        publishedAt: new Date(),
        lockedAt: null,
      },
      {
        companyId: 1,
        employeeId: 7,
        financialYearId: 1,
        periodType: PeriodType.QUARTERLY,
        sequenceNumber: 2,
        name: 'Q2',
        aggregationMethod: Method.SIMPLE_MONTHLY_AVERAGE,
        aggregateScore: '90.0000',
        ratingCode: null,
        sourceReviewHashes: ['q2'],
        calculationSnapshot: {},
        publishedAt: new Date(),
        lockedAt: null,
      },
    ]);
  });

  afterAll(async () => {
    if (source?.isInitialized) {
      try {
        await source.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await source.destroy();
      }
    }
  });

  async function calculate(
    method: Method,
    configuration: Record<string, unknown> | null = null,
  ) {
    await source.getRepository(PerformanceFinancialYear).update(1, {
      annualAggregationMethod: method,
      aggregationConfiguration: configuration,
    });
    const result = await service.calculate(actor, 1, PeriodType.ANNUAL);
    return result.aggregates.find((row) => row.employeeId === 7);
  }

  it('persists a simple average from published scores and excludes drafts', async () => {
    const result = await calculate(Method.SIMPLE_MONTHLY_AVERAGE);
    expect(result?.aggregateScore).toBe('90.0000');
    expect(result?.calculationSnapshot.source_count).toBe(2);
    expect(result?.calculationSnapshot).toMatchObject({
      formula_version: 'ANNUAL_SIMPLE_MONTHLY_AVERAGE_V1',
      source_period_ids: [1, 2],
      expected_period_ids: [1, 2],
      missing_period_ids: [],
    });
    expect(result?.calculationSnapshot.calculation_hash).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it('records the previous aggregate snapshot when recalculating', async () => {
    await calculate(Method.SIMPLE_MONTHLY_AVERAGE);
    auditLog.mockClear();
    await calculate(Method.SIMPLE_MONTHLY_AVERAGE);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 7,
        beforeValues: expect.objectContaining({
          aggregate_score: '90.0000',
          calculation_snapshot: expect.objectContaining({
            formula_version: 'ANNUAL_SIMPLE_MONTHLY_AVERAGE_V1',
          }),
        }),
        afterValues: expect.objectContaining({
          calculation_snapshot: expect.objectContaining({
            formula_version: 'ANNUAL_SIMPLE_MONTHLY_AVERAGE_V1',
          }),
        }),
      }),
    );
  });

  it.each([
    Method.WEIGHTED_MONTHLY_AVERAGE,
    Method.QUARTERLY_ROLLUP,
    Method.ANNUAL_TARGET_ACHIEVEMENT,
    Method.MONTHLY_AVERAGE_WITH_ADJUSTMENTS,
  ])('rejects unapproved annual aggregation method %s', async (method) => {
    await expect(calculate(method)).rejects.toThrow(
      'The approved Module 10 policy requires a simple average of scored published months.',
    );
  });

  it('calculates demo reviews and produces an annual report row end to end', async () => {
    const result = await calculate(Method.SIMPLE_MONTHLY_AVERAGE);
    expect(result?.aggregateScore).toBe('90.0000');

    const report = await performanceSummaryRunner.generate({
      reportCode: 'PERFORMANCE_SUMMARY',
      companyId: 1,
      outputFormat: ReportOutputFormatEnum.CSV,
      filenamePattern: 'performance-{{reportDate}}.csv',
      reportFilters: { financial_year_id: 1, period_type: 'ANNUAL' },
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });

    expect(report.recordCount).toBe(2);
    expect(report.filename).toBe('performance-2026-12-31.csv');
    expect(report.buffer.toString('utf8')).toContain(
      'DEMO-EMP-007,Amina Demo,100.0000,,90.0000,',
    );
    expect(report.buffer.toString('utf8')).toContain(
      'DEMO-EMP-008,Baraka Demo,,,,',
    );
  });
});
