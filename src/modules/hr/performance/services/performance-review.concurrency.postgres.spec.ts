import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { DataSource, EntitySchema } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { PerformanceReviewService } from './performance-review.service';
import { PerformanceAuditService } from './performance-audit.service';
import { PerformanceCompetencyService } from './performance-competency.service';
import { PerformanceImprovementPlanService } from './performance-improvement-plan.service';
import { PerformanceScorecardService } from './performance-scorecard.service';
import { PerformanceWorkflowService } from './performance-workflow.service';
import { PerformancePeriodAssignment } from '../entities/performance-period-assignment.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import { PerformanceReview } from '../entities/performance-review.entity';
import { KpiAchievement } from '../entities/kpi-achievement.entity';
import { PerformanceRatingScale } from '../entities/performance-rating-scale.entity';
import { PerformanceReviewModeration } from '../entities/performance-review-moderation.entity';
import { Company } from '../../../companies/entities/company.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { Department } from '../../departments/entities/department.entity';
import { PerformanceWorkflowConfig } from '../entities/performance-workflow-config.entity';
import { PerformanceReviewWorkflowStep } from '../entities/performance-review-workflow-step.entity';
import { PerformanceWorkflowStepTypeEnum } from '../enums/performance-workflow-step-type.enum';
import { PerformanceAppeal } from '../entities/performance-appeal.entity';

const databaseUrl = process.env.HRMS_WORKFLOW_TEST_DATABASE_URL;
const postgresSuite = databaseUrl ? describe : describe.skip;
postgresSuite('performance review concurrency with real PostgreSQL', () => {
  const schema = `hrms_workflow_${randomUUID().replace(/-/g, '')}`;
  let source: DataSource;
  let service: PerformanceReviewService;
  let workflow: PerformanceWorkflowService;
  let closeWorkflow: () => Promise<void>;
  let closeModule: () => Promise<void>;
  const actor: AuthenticatedUser = {
    id: 1,
    email: 'employee@example.test',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 1,
    companyMembershipId: 1,
    employeeId: 10,
    roles: [],
    permissions: [],
  };

  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.endsWith('_e2e'))
      throw new Error('A dedicated _e2e database is required.');
    const assignments = new EntitySchema<PerformancePeriodAssignment>({
      name: 'PerformancePeriodAssignment',
      target: PerformancePeriodAssignment,
      tableName: 'assignments',
      schema,
      columns: {
        id: { type: Number, primary: true },
        companyId: { type: Number },
        employeeId: { type: Number },
        performancePeriodId: { type: Number },
        managerEmployeeId: { type: Number },
        status: { type: String },
      },
    });
    const periods = new EntitySchema<PerformancePeriod>({
      name: 'PerformancePeriod',
      target: PerformancePeriod,
      tableName: 'periods',
      schema,
      columns: {
        id: { type: Number, primary: true },
        companyId: { type: Number },
        status: { type: String },
        startDate: { type: 'date' },
        finalReviewDeadline: { type: 'date' },
        kpiPhase: { type: String, nullable: true },
      },
    });
    const reviews = new EntitySchema<PerformanceReview>({
      name: 'PerformanceReview',
      target: PerformanceReview,
      tableName: 'reviews',
      schema,
      columns: {
        id: { type: Number, primary: true, generated: true },
        companyId: { type: Number },
        performancePeriodId: { type: Number },
        periodAssignmentId: { type: Number },
        employeeId: { type: Number },
        managerEmployeeId: { type: Number },
        status: { type: String },
        adjustmentScore: { type: 'numeric', precision: 12, scale: 4 },
        employeeSelfReview: { type: 'jsonb', nullable: true },
      },
      uniques: [
        { columns: ['companyId', 'performancePeriodId', 'employeeId'] },
      ],
    });
    const companies = new EntitySchema<Company>({
      name: 'Company',
      target: Company,
      tableName: 'companies',
      schema,
      columns: { id: { type: Number, primary: true } },
    });
    const workflowConfigs = new EntitySchema<PerformanceWorkflowConfig>({
      name: 'PerformanceWorkflowConfig',
      target: PerformanceWorkflowConfig,
      tableName: 'workflows',
      schema,
      columns: {
        id: { type: Number, primary: true, generated: true },
        companyId: { type: Number },
        code: { type: String },
        name: { type: String },
        isDefault: { type: Boolean },
        status: { type: String },
        steps: { type: 'jsonb' },
      },
      uniques: [{ columns: ['companyId', 'code'] }],
    });
    source = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema,
      entities: [assignments, periods, reviews, companies, workflowConfigs],
      synchronize: false,
      logging: false,
      extra: { max: 8, options: `-c search_path=${schema},public` },
    });
    await source.initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.synchronize();
    const module = await Test.createTestingModule({
      providers: [
        PerformanceReviewService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: HrAccessService,
          useValue: {
            ensureActorCompanyId: () => 1,
            hasCompanyScope: () => true,
          },
        },
        {
          provide: PerformanceAuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: PerformanceCompetencyService, useValue: {} },
        { provide: PerformanceImprovementPlanService, useValue: {} },
        { provide: PerformanceScorecardService, useValue: {} },
        { provide: PerformanceWorkflowService, useValue: {} },
        {
          provide: getRepositoryToken(PerformancePeriodAssignment),
          useValue: source.getRepository(PerformancePeriodAssignment),
        },
        {
          provide: getRepositoryToken(PerformanceReview),
          useValue: source.getRepository(PerformanceReview),
        },
        ...[
          KpiAchievement,
          PerformanceRatingScale,
          PerformanceReviewModeration,
          PerformanceAppeal,
        ].map((entity) => ({
          provide: getRepositoryToken(entity),
          useValue: {},
        })),
      ],
    }).compile();
    service = module.get(PerformanceReviewService);
    closeModule = () => module.close();
    const workflowModule = await Test.createTestingModule({
      providers: [
        PerformanceWorkflowService,
        {
          provide: HrAccessService,
          useValue: { ensureActorCompanyId: () => 1 },
        },
        {
          provide: PerformanceAuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: getRepositoryToken(PerformanceWorkflowConfig),
          useValue: source.getRepository(PerformanceWorkflowConfig),
        },
        ...[
          PerformanceReviewWorkflowStep,
          PerformanceReview,
          PerformancePeriodAssignment,
          Employee,
          Department,
        ].map((entity) => ({
          provide: getRepositoryToken(entity),
          useValue: {},
        })),
      ],
    }).compile();
    workflow = workflowModule.get(PerformanceWorkflowService);
    closeWorkflow = () => workflowModule.close();
    await source.query(`INSERT INTO "${schema}".companies VALUES (1)`);
    await source.query(
      `INSERT INTO "${schema}".periods VALUES (5, 1, 'OPEN', '2020-01-01', '2099-01-01', NULL)`,
    );
    await source.query(
      `INSERT INTO "${schema}".assignments VALUES (7, 1, 10, 5, 20, 'SELF_REVIEW')`,
    );
  });
  afterAll(async () => {
    if (closeModule) await closeModule();
    if (closeWorkflow) await closeWorkflow();
    if (source?.isInitialized) {
      try {
        await source.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await source.destroy();
      }
    }
  });

  it('allows only one concurrent self submission and persists one consistent next stage', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) =>
        service.submitSelfReview(actor, 7, {
          review: { comment: `Evidence ${index}` },
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failures = results.filter((result) => result.status === 'rejected');
    expect(failures).toHaveLength(5);
    for (const failure of failures)
      if (failure.status === 'rejected')
        expect(failure.reason).toBeInstanceOf(ConflictException);
    const reviews = await source.getRepository(PerformanceReview).find();
    expect(reviews).toHaveLength(1);
    expect(reviews[0].status).toBe('MANAGER_REVIEW_PENDING');
    const assignment = await source
      .getRepository(PerformancePeriodAssignment)
      .findOneByOrFail({ id: 7 });
    expect(assignment.status).toBe('MANAGER_REVIEW');
  });
  const steps = [
    {
      code: 'HR',
      label: 'HR approval',
      type: PerformanceWorkflowStepTypeEnum.HR_REVIEW,
      sequence_number: 1,
    },
  ];
  it('retains the existing default after a duplicate configuration fails', async () => {
    await workflow.create(actor, {
      code: 'DEFAULT',
      name: 'Existing workflow',
      is_default: true,
      steps,
    });
    await expect(
      workflow.create(actor, {
        code: 'DEFAULT',
        name: 'Duplicate workflow',
        is_default: true,
        steps,
      }),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });
    const defaults = await source
      .getRepository(PerformanceWorkflowConfig)
      .find({ where: { companyId: 1, isDefault: true } });
    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe('Existing workflow');
  });
  it('serializes concurrent default configuration switches', async () => {
    await Promise.all(
      ['FIRST', 'SECOND', 'THIRD'].map((code) =>
        workflow.create(actor, { code, name: code, is_default: true, steps }),
      ),
    );
    expect(
      await source
        .getRepository(PerformanceWorkflowConfig)
        .count({ where: { companyId: 1, isDefault: true } }),
    ).toBe(1);
  });
});
