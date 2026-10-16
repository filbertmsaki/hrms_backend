process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

type TestUser = {
  id: number;
  email: string;
  scope: 'company';
  userType: 'COMPANY_USER';
  companyId: number;
  companyMembershipId: number;
  employeeId?: number | null;
  roles: string[];
  permissions: string[];
};

let currentUser: TestUser = {
  id: 19,
  email: 'employee@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 10,
  companyMembershipId: 90,
  employeeId: 701,
  roles: ['Employee'],
  permissions: [],
};

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class MockJwtAuthGuard {
      canActivate(context: {
        switchToHttp: () => { getRequest: () => Record<string, unknown> };
      }) {
        const request = context.switchToHttp().getRequest();
        request.user = currentUser;
        return true;
      }
    },
}));

import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { SecurityEventsService } from '../src/modules/security/security-events.service';
import { PerformanceController } from '../src/modules/hr/performance/controllers/performance.controller';
import { PerformanceManagerController } from '../src/modules/hr/performance/controllers/performance-manager.controller';
import { PerformanceSelfServiceController } from '../src/modules/hr/performance/controllers/performance-self-service.controller';
import { KpiAchievementService } from '../src/modules/hr/performance/services/kpi-achievement.service';
import { KpiCategoryService } from '../src/modules/hr/performance/services/kpi-category.service';
import { KpiApplicabilityService } from '../src/modules/hr/performance/services/kpi-applicability.service';
import { KpiDataSourceRegistryService } from '../src/modules/hr/performance/services/kpi-data-source-registry.service';
import { KpiDefinitionService } from '../src/modules/hr/performance/services/kpi-definition.service';
import { EmployeeKpiCycleReviewService } from '../src/modules/hr/performance/services/employee-kpi-cycle-review.service';
import { EmployeeKpiService } from '../src/modules/hr/performance/services/employee-kpi.service';
import { EmployeeKpiTemplateAssignmentService } from '../src/modules/hr/performance/services/employee-kpi-template-assignment.service';
import { PerformanceAggregationService } from '../src/modules/hr/performance/services/performance-aggregation.service';
import { PerformanceCalibrationService } from '../src/modules/hr/performance/services/performance-calibration.service';
import { PerformanceCompetencyService } from '../src/modules/hr/performance/services/performance-competency.service';
import { PerformanceDevelopmentPlanService } from '../src/modules/hr/performance/services/performance-development-plan.service';
import { PerformanceFeedback360Service } from '../src/modules/hr/performance/services/performance-feedback-360.service';
import { PerformanceFinancialYearService } from '../src/modules/hr/performance/services/performance-financial-year.service';
import { PerformanceImprovementPlanService } from '../src/modules/hr/performance/services/performance-improvement-plan.service';
import { PerformanceInsightsService } from '../src/modules/hr/performance/services/performance-insights.service';
import { PerformancePeriodService } from '../src/modules/hr/performance/services/performance-period.service';
import { PerformancePlanService } from '../src/modules/hr/performance/services/performance-plan.service';
import { PerformanceRatingScaleService } from '../src/modules/hr/performance/services/performance-rating-scale.service';
import { PerformanceReportService } from '../src/modules/hr/performance/services/performance-report.service';
import { PerformanceReviewService } from '../src/modules/hr/performance/services/performance-review.service';
import { PerformanceScorecardService } from '../src/modules/hr/performance/services/performance-scorecard.service';
import { PerformanceWorkflowService } from '../src/modules/hr/performance/services/performance-workflow.service';

describe('Performance workflow endpoints (e2e)', () => {
  let app: INestApplication;
  let reviewService: Record<string, jest.Mock>;
  let workflowService: Record<string, jest.Mock>;
  let improvementPlanService: Record<string, jest.Mock>;
  let feedback360Service: Record<string, jest.Mock>;
  let calibrationService: Record<string, jest.Mock>;
  let securityEventsService: { logBestEffort: jest.Mock };

  beforeEach(async () => {
    currentUser = {
      id: 19,
      email: 'employee@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 10,
      companyMembershipId: 90,
      employeeId: 701,
      roles: ['Employee'],
      permissions: [],
    };

    reviewService = {
      submitSelfReview: jest
        .fn()
        .mockResolvedValue({ id: 501, status: 'SELF_REVIEW_SUBMITTED' }),
      submitManagerReview: jest
        .fn()
        .mockResolvedValue({ id: 501, status: 'MANAGER_REVIEW_SUBMITTED' }),
      approve: jest.fn().mockResolvedValue({ id: 501, status: 'APPROVED' }),
      moderate: jest.fn().mockResolvedValue({ id: 501, final_score: 86 }),
      reopen: jest.fn().mockResolvedValue({ id: 501, status: 'REOPENED' }),
      listAppeals: jest.fn().mockResolvedValue([{ id: 61 }]),
      submitAppeal: jest.fn().mockResolvedValue({ id: 61, status: 'OPEN' }),
      listForEmployee: jest.fn().mockResolvedValue([{ id: 501 }]),
    };
    workflowService = {
      getReviewWorkflow: jest.fn().mockResolvedValue([{ id: 81 }]),
      actOnCurrentStep: jest.fn().mockResolvedValue({
        completed: true,
        periodAssignmentId: 77,
      }),
    };
    improvementPlanService = {
      create: jest.fn().mockResolvedValue({ id: 21, status: 'OPEN' }),
      list: jest.fn().mockResolvedValue([{ id: 21 }]),
      acknowledge: jest
        .fn()
        .mockResolvedValue({ id: 21, employee_acknowledged_at: 'now' }),
      reviewMilestone: jest
        .fn()
        .mockResolvedValue({ id: 31, status: 'COMPLETED' }),
      close: jest.fn().mockResolvedValue({ id: 21, status: 'CLOSED' }),
    };
    feedback360Service = {
      invite: jest.fn().mockResolvedValue([{ id: 41 }]),
      listForReview: jest.fn().mockResolvedValue([{ id: 41 }]),
      getSummaryForReview: jest.fn().mockResolvedValue({ average_score: 84 }),
      listAssignedToMe: jest.fn().mockResolvedValue([{ id: 41 }]),
      submit: jest.fn().mockResolvedValue({ id: 41, status: 'SUBMITTED' }),
      decline: jest.fn().mockResolvedValue({ id: 42, status: 'DECLINED' }),
    };
    calibrationService = {
      departmentSummary: jest.fn().mockResolvedValue([{ department_id: 8 }]),
      comparison: jest.fn().mockResolvedValue({ spread: [] }),
    };
    securityEventsService = {
      logBestEffort: jest.fn().mockResolvedValue(undefined),
    };

    const noopService = {};
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        PerformanceController,
        PerformanceManagerController,
        PerformanceSelfServiceController,
      ],
      providers: [
        { provide: PerformanceFinancialYearService, useValue: noopService },
        { provide: PerformancePeriodService, useValue: noopService },
        { provide: PerformanceRatingScaleService, useValue: noopService },
        { provide: PerformanceScorecardService, useValue: noopService },
        { provide: PerformanceWorkflowService, useValue: workflowService },
        { provide: PerformanceCompetencyService, useValue: noopService },
        { provide: KpiDefinitionService, useValue: noopService },
        { provide: KpiCategoryService, useValue: noopService },
        { provide: KpiApplicabilityService, useValue: noopService },
        { provide: PerformancePlanService, useValue: noopService },
        { provide: KpiDataSourceRegistryService, useValue: noopService },
        { provide: PerformanceReviewService, useValue: reviewService },
        {
          provide: PerformanceImprovementPlanService,
          useValue: improvementPlanService,
        },
        { provide: PerformanceDevelopmentPlanService, useValue: noopService },
        { provide: PerformanceReportService, useValue: noopService },
        { provide: PerformanceAggregationService, useValue: noopService },
        {
          provide: PerformanceCalibrationService,
          useValue: calibrationService,
        },
        { provide: PerformanceInsightsService, useValue: noopService },
        {
          provide: PerformanceFeedback360Service,
          useValue: feedback360Service,
        },
        { provide: KpiAchievementService, useValue: noopService },
        { provide: EmployeeKpiService, useValue: noopService },
        { provide: EmployeeKpiCycleReviewService, useValue: noopService },
        {
          provide: EmployeeKpiTemplateAssignmentService,
          useValue: noopService,
        },
        { provide: SecurityEventsService, useValue: securityEventsService },
        PermissionsGuard,
        TenantGuard,
        Reflector,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('protects employee self review behind the self-review permission', async () => {
    await request(app.getHttpServer() as App)
      .post('/performance/me/reviews/77/self-review')
      .send({ review: { summary: 'Completed all agreed goals.' } })
      .expect(403);

    expect(reviewService.submitSelfReview).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: ['performance_reviews:self-review'],
        }),
      }),
    );
  });

  it('routes self, manager, HR approval, workflow, moderation, reopen, and appeal actions', async () => {
    currentUser = {
      ...currentUser,
      roles: ['HR'],
      permissions: [
        'performance_reviews:self-review',
        'performance_manager:review',
        'performance_reviews:approve',
        'performance_reviews:workflow-action',
        'performance_reviews:moderate',
        'performance_reviews:reopen',
        'performance_reviews:appeal-review',
        'performance_reviews:appeal',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/performance/me/reviews/77/self-review')
      .send({ review: { summary: 'Completed all agreed goals.' } })
      .expect(201);
    expect(reviewService.submitSelfReview).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      77,
      expect.objectContaining({ review: expect.any(Object) }),
    );

    await request(app.getHttpServer() as App)
      .post('/performance/manager/reviews/77/submit')
      .send({
        review: { summary: 'Strong delivery.' },
        competency_ratings: [{ template_item_code: 'OWNERSHIP', rating: 4 }],
        recommendations: ['Promote stretch assignments.'],
      })
      .expect(201);
    expect(reviewService.submitManagerReview).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10 }),
      77,
      expect.objectContaining({
        competency_ratings: [
          expect.objectContaining({ template_item_code: 'OWNERSHIP' }),
        ],
      }),
    );

    await request(app.getHttpServer() as App)
      .post('/performance/reviews/77/approve')
      .send({
        hr_review: { summary: 'Approved.' },
        adjustment_score: 88,
        publish: true,
      })
      .expect(201);
    expect(reviewService.approve).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 90 }),
      77,
      expect.objectContaining({ publish: true }),
    );

    await request(app.getHttpServer() as App)
      .post('/performance/reviews/501/workflow/action')
      .send({ decision: 'APPROVE', comment: 'Final approval.', publish: true })
      .expect(201);
    expect(workflowService.actOnCurrentStep).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10 }),
      501,
      expect.objectContaining({ decision: 'APPROVE' }),
    );
    expect(reviewService.approve).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 90 }),
      77,
      expect.objectContaining({ decision: 'APPROVE' }),
    );

    await request(app.getHttpServer() as App)
      .post('/performance/reviews/501/moderate')
      .send({ final_score: 86, reason: 'Calibration committee decision.' })
      .expect(201);
    expect(reviewService.moderate).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10 }),
      501,
      expect.objectContaining({ final_score: 86 }),
    );

    await request(app.getHttpServer() as App)
      .post('/performance/reviews/501/reopen')
      .send({ reason: 'Evidence was submitted late.' })
      .expect(201);
    expect(reviewService.reopen).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10 }),
      501,
      expect.objectContaining({ reason: 'Evidence was submitted late.' }),
    );

    await request(app.getHttpServer() as App)
      .get('/performance/appeals')
      .expect(200);
    expect(reviewService.listAppeals).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10 }),
    );

    await request(app.getHttpServer() as App)
      .post('/performance/me/reviews/501/appeal')
      .send({
        reason: 'Manager rating missed approved achievements.',
        requested_changes: { final_score: 90 },
      })
      .expect(201);
    expect(reviewService.submitAppeal).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      501,
      expect.objectContaining({ requested_changes: { final_score: 90 } }),
    );
  });

  it('routes PIP, 360 feedback, and calibration workflows through scoped services', async () => {
    currentUser = {
      ...currentUser,
      roles: ['HR'],
      permissions: [
        'performance_pip:create',
        'performance_pip:read',
        'performance_pip:review',
        'performance_pip:close',
        'performance_self_service:read',
        'performance_self_service:update',
        'performance_feedback_360:invite',
        'performance_feedback_360:read',
        'performance_feedback_360:self:read',
        'performance_feedback_360:self:submit',
        'performance_calibration:read',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/performance/reviews/501/improvement-plan')
      .send({
        summary: 'Improve delivery predictability.',
        objectives: ['Ship agreed sprint scope consistently.'],
        milestones: [
          {
            title: 'First checkpoint',
            due_date: '2026-10-15',
            description: 'Review first sprint after PIP start.',
          },
        ],
      })
      .expect(201);
    expect(improvementPlanService.create).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10 }),
      501,
      expect.objectContaining({ objectives: expect.any(Array) }),
    );

    await request(app.getHttpServer() as App)
      .post('/performance/me/improvement-plans/21/acknowledge')
      .expect(201);
    expect(improvementPlanService.acknowledge).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      21,
    );

    await request(app.getHttpServer() as App)
      .post('/performance/improvement-milestones/31/review')
      .send({ status: 'COMPLETED', manager_comment: 'Milestone met.' })
      .expect(201);
    expect(improvementPlanService.reviewMilestone).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 90 }),
      31,
      expect.objectContaining({ status: 'COMPLETED' }),
    );

    await request(app.getHttpServer() as App)
      .post('/performance/improvement-plans/21/close')
      .expect(201);
    expect(improvementPlanService.close).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 90 }),
      21,
    );

    await request(app.getHttpServer() as App)
      .post('/performance/reviews/501/feedback-360/invitations')
      .send({
        invitations: [
          {
            rater_employee_id: 802,
            relationship_type: 'PEER',
            due_date: '2026-10-20',
            is_anonymous: true,
          },
        ],
      })
      .expect(201);
    expect(feedback360Service.invite).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10 }),
      501,
      expect.objectContaining({ invitations: expect.any(Array) }),
    );

    await request(app.getHttpServer() as App)
      .get('/performance/reviews/501/feedback-360')
      .expect(200);
    expect(feedback360Service.listForReview).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10 }),
      501,
    );

    await request(app.getHttpServer() as App)
      .get('/performance/reviews/501/feedback-360/summary')
      .expect(200);
    expect(feedback360Service.getSummaryForReview).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10 }),
      501,
    );

    await request(app.getHttpServer() as App)
      .get('/performance/me/feedback-360')
      .expect(200);
    expect(feedback360Service.listAssignedToMe).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
    );

    await request(app.getHttpServer() as App)
      .post('/performance/me/feedback-360/41/submit')
      .send({
        ratings: { collaboration: 90 },
        overall_score: 88,
        strengths: 'Very responsive.',
      })
      .expect(201);
    expect(feedback360Service.submit).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      41,
      expect.objectContaining({ overall_score: 88 }),
    );

    await request(app.getHttpServer() as App)
      .post('/performance/me/feedback-360/42/decline')
      .send({ reason: 'Conflict of interest.' })
      .expect(201);
    expect(feedback360Service.decline).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      42,
      expect.objectContaining({ reason: 'Conflict of interest.' }),
    );

    await request(app.getHttpServer() as App)
      .get('/performance/calibration/departments')
      .expect(200);
    expect(calibrationService.departmentSummary).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10 }),
    );

    await request(app.getHttpServer() as App)
      .get('/performance/calibration/comparison')
      .expect(200);
    expect(calibrationService.comparison).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10 }),
    );
  });
});
