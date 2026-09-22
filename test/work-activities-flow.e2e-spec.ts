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
  id: 29,
  email: 'field.employee@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 10,
  companyMembershipId: 190,
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
import { ManagerActivitiesController } from '../src/modules/hr/work-activities/controllers/manager-activities.controller';
import { ManagerFieldVisitsController } from '../src/modules/hr/work-activities/controllers/manager-field-visits.controller';
import { MyDailyActivitiesController } from '../src/modules/hr/work-activities/controllers/my-daily-activities.controller';
import { MyFieldVisitsController } from '../src/modules/hr/work-activities/controllers/my-field-visits.controller';
import { ActivityPolicyService } from '../src/modules/hr/work-activities/services/activity-policy.service';
import { DailyActivityService } from '../src/modules/hr/work-activities/services/daily-activity.service';
import { FieldMobileSyncService } from '../src/modules/hr/work-activities/services/field-mobile-sync.service';
import { FieldVisitService } from '../src/modules/hr/work-activities/services/field-visit.service';
import { WorkActivityInsightsService } from '../src/modules/hr/work-activities/services/work-activity-insights.service';

describe('Work activity endpoints (e2e)', () => {
  let app: INestApplication;
  let dailyActivityService: Record<string, jest.Mock>;
  let fieldVisitService: Record<string, jest.Mock>;
  let insightsService: Record<string, jest.Mock>;
  let policyService: Record<string, jest.Mock>;
  let syncService: Record<string, jest.Mock>;
  let securityEventsService: { logBestEffort: jest.Mock };

  beforeEach(async () => {
    currentUser = {
      id: 29,
      email: 'field.employee@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 10,
      companyMembershipId: 190,
      employeeId: 701,
      roles: ['Employee'],
      permissions: [],
    };

    dailyActivityService = {
      listMine: jest.fn().mockResolvedValue([{ id: 101 }]),
      getOrCreateMyDailyReport: jest.fn().mockResolvedValue({ id: 101 }),
      listMineTasks: jest.fn().mockResolvedValue([]),
      createMyTask: jest.fn().mockResolvedValue({ id: 901 }),
      getMine: jest.fn().mockResolvedValue({ id: 101 }),
      addMyEntry: jest.fn().mockResolvedValue({ id: 201 }),
      updateMyEntry: jest.fn().mockResolvedValue({ id: 201 }),
      removeMyEntry: jest.fn().mockResolvedValue(undefined),
      addMyEvidence: jest.fn().mockResolvedValue({ id: 301 }),
      addMyComment: jest.fn().mockResolvedValue({ id: 401 }),
      submitMyDailyReport: jest
        .fn()
        .mockResolvedValue({ id: 101, status: 'MANAGER_REVIEW_PENDING' }),
      listForManager: jest.fn().mockResolvedValue([{ id: 101 }]),
      listManagerTasks: jest.fn().mockResolvedValue([]),
      listManagerAssignees: jest.fn().mockResolvedValue([{ employee_id: 701 }]),
      listPendingReviews: jest.fn().mockResolvedValue([{ id: 101 }]),
      createManagerTask: jest.fn().mockResolvedValue({ id: 902 }),
      addManagerComment: jest.fn().mockResolvedValue({ id: 402 }),
      getForManager: jest.fn().mockResolvedValue({ id: 101 }),
      reviewDailyActivity: jest
        .fn()
        .mockResolvedValue({ id: 101, status: 'APPROVED' }),
    };
    fieldVisitService = {
      listMyPlans: jest.fn().mockResolvedValue([{ id: 301 }]),
      createMyPlan: jest.fn().mockResolvedValue({ id: 301 }),
      getMyPlan: jest.fn().mockResolvedValue({ id: 301 }),
      updateMyPlan: jest.fn().mockResolvedValue({ id: 301 }),
      submitMyPlan: jest
        .fn()
        .mockResolvedValue({ id: 301, status: 'SUBMITTED' }),
      createUnplannedVisit: jest.fn().mockResolvedValue({ id: 402 }),
      listMyVisits: jest.fn().mockResolvedValue([{ id: 401 }]),
      getMyVisit: jest.fn().mockResolvedValue({ id: 401 }),
      checkIn: jest.fn().mockResolvedValue({ id: 401, status: 'CHECKED_IN' }),
      checkOut: jest.fn().mockResolvedValue({ id: 401, status: 'COMPLETED' }),
      addEvidence: jest.fn().mockResolvedValue({ id: 501 }),
      addOpportunity: jest.fn().mockResolvedValue({ id: 601 }),
      addExpense: jest.fn().mockResolvedValue({ id: 701 }),
      listMyFollowUps: jest.fn().mockResolvedValue([{ id: 801 }]),
      createMyFollowUp: jest.fn().mockResolvedValue({ id: 801 }),
      updateMyFollowUp: jest.fn().mockResolvedValue({ id: 801 }),
      cancelMyFollowUp: jest.fn().mockResolvedValue(undefined),
      completeMyFollowUp: jest.fn().mockResolvedValue({ id: 801 }),
      listManagerPlans: jest.fn().mockResolvedValue([{ id: 301 }]),
      reviewPlan: jest.fn().mockResolvedValue({ id: 301, status: 'APPROVED' }),
      listManagerVisits: jest.fn().mockResolvedValue([{ id: 401 }]),
      getForManager: jest.fn().mockResolvedValue({ id: 401 }),
      reviewVisit: jest
        .fn()
        .mockResolvedValue({ id: 401, status: 'REVIEWED' }),
      getMapPoints: jest.fn().mockResolvedValue([{ id: 1, latitude: -6.8 }]),
      getPlannedVsActual: jest.fn().mockResolvedValue({ planned: 1, actual: 1 }),
      listManagerFollowUps: jest.fn().mockResolvedValue([{ id: 801 }]),
      listExceptions: jest.fn().mockResolvedValue([]),
    };
    insightsService = {
      getManagerSummary: jest.fn().mockResolvedValue({ pending_reviews: 1 }),
    };
    policyService = {
      listCategories: jest.fn().mockResolvedValue([{ id: 1 }]),
    };
    syncService = {
      sync: jest.fn().mockResolvedValue({ sync_request_id: 'sync-1' }),
      getStatus: jest.fn().mockResolvedValue({ sync_request_id: 'sync-1' }),
    };
    securityEventsService = {
      logBestEffort: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        MyDailyActivitiesController,
        ManagerActivitiesController,
        MyFieldVisitsController,
        ManagerFieldVisitsController,
      ],
      providers: [
        { provide: DailyActivityService, useValue: dailyActivityService },
        { provide: FieldVisitService, useValue: fieldVisitService },
        { provide: WorkActivityInsightsService, useValue: insightsService },
        { provide: ActivityPolicyService, useValue: policyService },
        { provide: FieldMobileSyncService, useValue: syncService },
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
    await app.close();
  });

  it('protects my daily activities behind the self-service read permission', async () => {
    await request(app.getHttpServer() as App).get('/me/activities').expect(403);

    expect(dailyActivityService.listMine).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: ['work_activities:self-service:read'],
        }),
      }),
    );
  });

  it('routes daily activity creation, evidence, submission, and manager review', async () => {
    currentUser = {
      ...currentUser,
      roles: ['Manager'],
      permissions: [
        'work_activities:self-service:read',
        'work_activities:self-service:update',
        'work_activities:manager:read',
        'work_activities:manager:review',
      ],
    };

    await request(app.getHttpServer() as App)
      .get('/me/activities?date_from=2026-09-01&date_to=2026-09-30')
      .expect(200);
    expect(dailyActivityService.listMine).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      expect.objectContaining({ date_from: '2026-09-01' }),
    );

    await request(app.getHttpServer() as App)
      .post('/me/activities/reports')
      .send({
        activity_date: '2026-09-22',
        source: 'WEB',
        client_request_id: '11111111-1111-4111-8111-111111111111',
      })
      .expect(201);
    expect(dailyActivityService.getOrCreateMyDailyReport).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10, employeeId: 701 }),
      '2026-09-22',
      '11111111-1111-4111-8111-111111111111',
      'WEB',
    );

    await request(app.getHttpServer() as App)
      .post('/me/activities/reports/101/entries')
      .send({
        activity_category_id: 1,
        title: 'Client renewal follow-up',
        description: 'Called renewal portfolio customers.',
        status: 'COMPLETED',
        outcome: 'Renewal discussion completed.',
        completion_percentage: 100,
        priority: 'HIGH',
      })
      .expect(201);
    expect(dailyActivityService.addMyEntry).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      101,
      expect.objectContaining({ title: 'Client renewal follow-up' }),
    );

    await request(app.getHttpServer() as App)
      .post('/me/activities/entries/201/evidence')
      .send({ document_id: 77, description: 'Call log export.' })
      .expect(201);
    expect(dailyActivityService.addMyEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      201,
      expect.objectContaining({ document_id: 77 }),
    );

    await request(app.getHttpServer() as App)
      .post('/me/activities/entries/201/comments')
      .send({ body: 'Customer requested updated quote.' })
      .expect(201);
    expect(dailyActivityService.addMyComment).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      201,
      expect.objectContaining({ body: 'Customer requested updated quote.' }),
    );

    await request(app.getHttpServer() as App)
      .post('/me/activities/reports/101/submit')
      .send({
        employee_summary: 'Completed daily activities.',
        client_request_id: '22222222-2222-4222-8222-222222222222',
        entry_ids: [201],
      })
      .expect(201);
    expect(dailyActivityService.submitMyDailyReport).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      101,
      expect.objectContaining({ entry_ids: [201] }),
    );

    await request(app.getHttpServer() as App)
      .get('/manager/activities/pending-reviews?date_from=2026-09-01')
      .expect(200);
    expect(dailyActivityService.listPendingReviews).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 190 }),
      expect.objectContaining({ date_from: '2026-09-01' }),
    );

    await request(app.getHttpServer() as App)
      .post('/manager/activities/reports/101/review')
      .send({
        decision: 'APPROVE',
        comments: 'Good field follow-through.',
        rating: '4.5',
        entry_reviews: [{ entry_id: 201, manager_validated: true }],
      })
      .expect(201);
    expect(dailyActivityService.reviewDailyActivity).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 190 }),
      101,
      expect.objectContaining({ decision: 'APPROVE' }),
    );
  });

  it('routes field visit planning, mobile events, review, and manager static reports', async () => {
    currentUser = {
      ...currentUser,
      roles: ['Manager'],
      permissions: [
        'field_visits:self-service:read',
        'field_visits:self-service:update',
        'field_visits:manager:read',
        'field_visits:manager:review',
        'field_locations:read',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/me/field-visits/plans')
      .send({
        visit_date: '2026-09-22',
        plan_summary: 'Renewal visits in Dar es Salaam.',
        client_request_id: '33333333-3333-4333-8333-333333333333',
        items: [
          {
            visit_type: 'CUSTOMER_VISIT',
            purpose: 'Renewal discussion',
            expected_outcome: 'Signed renewal intent.',
            latitude: -6.816,
            longitude: 39.28,
          },
        ],
      })
      .expect(201);
    expect(fieldVisitService.createMyPlan).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      expect.objectContaining({ items: expect.any(Array) }),
    );

    await request(app.getHttpServer() as App)
      .post('/me/field-visits/plans/301/submit')
      .send({ plan_summary: 'Ready for manager review.' })
      .expect(201);
    expect(fieldVisitService.submitMyPlan).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      301,
      expect.objectContaining({ plan_summary: 'Ready for manager review.' }),
    );

    await request(app.getHttpServer() as App)
      .post('/me/field-visits/unplanned')
      .send({
        visit_date: '2026-09-22',
        visit_type: 'PROSPECT_VISIT',
        purpose: 'Urgent prospect meeting.',
        unplanned_reason: 'Prospect requested same-day visit.',
        client_request_id: '44444444-4444-4444-8444-444444444444',
      })
      .expect(201);
    expect(fieldVisitService.createUnplannedVisit).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      expect.objectContaining({ unplanned_reason: expect.any(String) }),
    );

    await request(app.getHttpServer() as App)
      .post('/me/field-visits/401/check-in')
      .send({
        client_request_id: '55555555-5555-4555-8555-555555555555',
        captured_at: '2026-09-22T06:30:00.000Z',
        latitude: -6.816,
        longitude: 39.28,
        accuracy_meters: 12,
        device_identifier: 'device-701',
      })
      .expect(201);
    expect(fieldVisitService.checkIn).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      401,
      expect.objectContaining({ device_identifier: 'device-701' }),
    );

    await request(app.getHttpServer() as App)
      .post('/me/field-visits/401/check-out')
      .send({
        client_request_id: '66666666-6666-4666-8666-666666666666',
        captured_at: '2026-09-22T08:30:00.000Z',
        latitude: -6.817,
        longitude: 39.281,
        discussion_notes: 'Discussed renewal terms.',
        outcome: 'Customer requested final quotation.',
        follow_up_required: true,
        next_follow_up_date: '2026-09-29',
        opportunities: [
          {
            opportunity_type: 'RENEWAL',
            title: 'Renewal quote',
            potential_value: 1500000,
            currency: 'TZS',
          },
        ],
      })
      .expect(201);
    expect(fieldVisitService.checkOut).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      401,
      expect.objectContaining({ follow_up_required: true }),
    );

    await request(app.getHttpServer() as App)
      .post('/me/field-visits/401/evidence')
      .send({
        evidence_type: 'PHOTO',
        document_id: 88,
        description: 'Visit photo.',
        client_request_id: '77777777-7777-4777-8777-777777777777',
      })
      .expect(201);
    expect(fieldVisitService.addEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 701 }),
      401,
      expect.objectContaining({ document_id: 88 }),
    );

    await request(app.getHttpServer() as App)
      .post('/manager/field-visits/plans/301/review')
      .send({ decision: 'APPROVE', comments: 'Plan approved.' })
      .expect(201);
    expect(fieldVisitService.reviewPlan).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 190 }),
      301,
      expect.objectContaining({ decision: 'APPROVE' }),
    );

    await request(app.getHttpServer() as App)
      .post('/manager/field-visits/401/review')
      .send({
        decision: 'APPROVE',
        comments: 'Visit reviewed.',
        validate_opportunities: true,
        opportunity_validations: [{ opportunity_id: 601, validated: true }],
        approved_expense_ids: [701],
      })
      .expect(201);
    expect(fieldVisitService.reviewVisit).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 190 }),
      401,
      expect.objectContaining({ validate_opportunities: true }),
    );

    await request(app.getHttpServer() as App)
      .get(
        '/manager/field-visits/map?date_from=2026-09-01&purpose=manager-dashboard',
      )
      .expect(200);
    expect(fieldVisitService.getMapPoints).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10 }),
      expect.objectContaining({ date_from: '2026-09-01' }),
    );

    await request(app.getHttpServer() as App)
      .get('/manager/field-visits/planned-vs-actual?date_from=2026-09-01')
      .expect(200);
    expect(fieldVisitService.getPlannedVsActual).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10 }),
      expect.objectContaining({ date_from: '2026-09-01' }),
    );

    await request(app.getHttpServer() as App)
      .get('/manager/field-visits/follow-ups?date_from=2026-09-01')
      .expect(200);
    expect(fieldVisitService.listManagerFollowUps).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10 }),
      expect.objectContaining({ date_from: '2026-09-01' }),
    );

    await request(app.getHttpServer() as App)
      .get('/manager/field-visits/exceptions')
      .expect(200);
    expect(fieldVisitService.listExceptions).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10 }),
    );
  });
});
