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
  id: 9,
  email: 'hr@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 10,
  companyMembershipId: 33,
  employeeId: null,
  roles: ['HR'],
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
import { OffboardingController } from '../src/modules/hr/offboarding/offboarding.controller';
import { OffboardingService } from '../src/modules/hr/offboarding/offboarding.service';

describe('Offboarding flow endpoints (e2e)', () => {
  let app: INestApplication;
  let offboardingService: Record<string, jest.Mock>;
  let securityEventsService: { logBestEffort: jest.Mock };

  beforeEach(async () => {
    currentUser = {
      id: 9,
      email: 'hr@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 10,
      companyMembershipId: 33,
      employeeId: null,
      roles: ['HR'],
      permissions: [],
    };

    offboardingService = {
      createOffboardingRequest: jest.fn().mockResolvedValue({
        id: 77,
        employee_id: 501,
        status: 'draft',
      }),
      submitOffboardingRequest: jest.fn().mockResolvedValue({
        id: 77,
        status: 'submitted',
      }),
      updateOffboardingRequest: jest.fn().mockResolvedValue({ id: 77 }),
      cancelOffboardingRequest: jest.fn().mockResolvedValue({
        id: 77,
        status: 'cancelled',
      }),
      completeOffboardingRequest: jest.fn().mockResolvedValue({
        id: 77,
        status: 'ready_for_finalization',
      }),
      finalizeOffboarding: jest.fn().mockResolvedValue({
        id: 77,
        status: 'completed',
        employee: { id: 501, employment_status: 'terminated' },
      }),
      findOneOffboardingRequest: jest.fn().mockResolvedValue({ id: 77 }),
      findAllOffboardingRequests: jest
        .fn()
        .mockResolvedValue({ data: [{ id: 77 }], meta: { total: 1 } }),
      getDashboard: jest.fn().mockResolvedValue({ total_open: 1 }),
      listAccessOperations: jest.fn().mockResolvedValue([{ id: 90 }]),
      retryAccessTermination: jest.fn().mockResolvedValue({ retried: true }),
      emergencyTerminateAccess: jest.fn().mockResolvedValue({
        id: 77,
        access_terminated_at: '2026-08-03T08:00:00.000Z',
      }),
      addDocument: jest.fn().mockResolvedValue({ id: 22 }),
      listDocuments: jest.fn().mockResolvedValue([{ id: 22 }]),
      createTask: jest.fn().mockResolvedValue({ id: 31 }),
      completeTask: jest.fn().mockResolvedValue({
        id: 31,
        status: 'completed',
      }),
      createAssetReturn: jest.fn().mockResolvedValue({ id: 41 }),
      updateAssetReturn: jest.fn().mockResolvedValue({
        id: 41,
        status: 'returned',
      }),
      createSettlementItem: jest.fn().mockResolvedValue({ id: 51 }),
      updateSettlementItem: jest.fn().mockResolvedValue({
        id: 51,
        status: 'completed',
      }),
      createClearance: jest.fn().mockResolvedValue({ id: 61 }),
      completeClearance: jest.fn().mockResolvedValue({
        id: 61,
        status: 'cleared',
      }),
      applyApprovalAction: jest.fn().mockResolvedValue({
        id: 77,
        status: 'in_progress',
      }),
      upsertExitInterview: jest.fn().mockResolvedValue({ id: 71 }),
      getProgress: jest.fn().mockResolvedValue({
        request_id: 77,
        progress_percentage: 90,
      }),
      getApprovals: jest.fn().mockResolvedValue([{ id: 81 }]),
      getAuditLogs: jest.fn().mockResolvedValue([{ id: 1 }]),
    };
    securityEventsService = {
      logBestEffort: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [OffboardingController],
      providers: [
        { provide: OffboardingService, useValue: offboardingService },
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

  it('protects offboarding request listing behind read permission', async () => {
    await request(app.getHttpServer() as App)
      .get('/offboarding/requests?page=1&limit=20')
      .expect(403);

    expect(
      offboardingService.findAllOffboardingRequests,
    ).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: ['offboarding_requests:read'],
          missing_permissions: ['offboarding_requests:read'],
        }),
      }),
    );
  });

  it('routes an HR offboarding lifecycle through tenant-scoped service calls', async () => {
    currentUser = {
      ...currentUser,
      permissions: [
        'offboarding_requests:create',
        'offboarding_requests:submit',
        'offboarding_requests:read',
        'offboarding_requests:update',
        'offboarding_requests:complete',
        'offboarding_requests:finalize',
        'offboarding_access:read',
        'offboarding_access:retry',
        'offboarding_access:emergency-terminate',
        'offboarding_documents:create',
        'offboarding_tasks:create',
        'offboarding_tasks:complete',
        'offboarding_clearances:create',
        'offboarding_clearances:complete',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/offboarding/requests')
      .send({
        employee_id: 501,
        workflow_id: 12,
        title: 'Exit Asha',
        offboarding_type: 'resignation',
        reason: 'Personal reasons',
        notice_date: '2026-08-01',
        last_working_date: '2026-08-31',
        notice_period_waived: true,
        notice_period_waiver_reason: 'Approved by HR',
        access_termination_mode: 'AT_LAST_WORKING_DAY',
        submit: false,
      })
      .expect(201);

    expect(offboardingService.createOffboardingRequest).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        employee_id: 501,
        workflow_id: 12,
        offboarding_type: 'resignation',
        last_working_date: '2026-08-31',
        notice_period_waived: true,
        notice_period_waiver_reason: 'Approved by HR',
      }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.objectContaining({ user_agent: null }),
    );

    await request(app.getHttpServer() as App)
      .post('/offboarding/requests/77/submit')
      .send({ workflow_id: 12 })
      .expect(201);

    expect(offboardingService.submitOffboardingRequest).toHaveBeenCalledWith(
      10,
      77,
      expect.objectContaining({ workflow_id: 12 }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );

    await request(app.getHttpServer() as App)
      .post('/offboarding/requests/77/documents')
      .send({
        document_type: 'resignation_letter',
        title: 'Resignation Letter',
        file: {
          fileName: 'resignation.pdf',
          fileSize: 18,
          mimeType: 'application/pdf',
          fileString: Buffer.from('resignation').toString('base64'),
        },
      })
      .expect(201);

    expect(offboardingService.addDocument).toHaveBeenCalledWith(
      10,
      77,
      expect.objectContaining({ title: 'Resignation Letter' }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );

    await request(app.getHttpServer() as App)
      .post('/offboarding/requests/77/tasks')
      .send({
        title: 'Disable application access',
        task_type: 'it',
        priority: 'high',
        assigned_to_company_user_id: 44,
        due_date: '2026-08-25',
      })
      .expect(201);

    expect(offboardingService.createTask).toHaveBeenCalledWith(
      10,
      77,
      expect.objectContaining({
        title: 'Disable application access',
        task_type: 'it',
        assigned_to_company_user_id: 44,
      }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );

    await request(app.getHttpServer() as App)
      .post('/offboarding/requests/77/tasks/31/complete')
      .send({
        remarks: 'Access removed.',
        evidence_document_id: 22,
        completion_data: { ticket: 'IT-100' },
      })
      .expect(201);

    expect(offboardingService.completeTask).toHaveBeenCalledWith(
      10,
      77,
      31,
      expect.objectContaining({ evidence_document_id: 22 }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );

    await request(app.getHttpServer() as App)
      .post('/offboarding/requests/77/assets')
      .send({
        asset_type: 'laptop',
        asset_label: 'Company Laptop',
        asset_identifier: 'LAP-501',
        status: 'pending',
        due_date: '2026-08-31',
      })
      .expect(201);

    expect(offboardingService.createAssetReturn).toHaveBeenCalledWith(
      10,
      77,
      expect.objectContaining({
        asset_type: 'laptop',
        asset_label: 'Company Laptop',
      }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );

    await request(app.getHttpServer() as App)
      .patch('/offboarding/requests/77/assets/41')
      .send({
        status: 'returned',
        received_by_company_user_id: 33,
        condition_at_return: 'good',
      })
      .expect(200);

    expect(offboardingService.updateAssetReturn).toHaveBeenCalledWith(
      10,
      77,
      41,
      expect.objectContaining({ status: 'returned' }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );

    await request(app.getHttpServer() as App)
      .post('/offboarding/requests/77/settlements')
      .send({
        item_type: 'final_salary',
        title: 'Final salary',
        amount: '1500.00',
        currency: 'USD',
        due_date: '2026-09-05',
      })
      .expect(201);

    expect(offboardingService.createSettlementItem).toHaveBeenCalledWith(
      10,
      77,
      expect.objectContaining({
        item_type: 'final_salary',
        amount: '1500.00',
      }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );

    await request(app.getHttpServer() as App)
      .patch('/offboarding/requests/77/settlements/51')
      .send({ status: 'completed', remarks: 'Paid in final payroll.' })
      .expect(200);

    expect(offboardingService.updateSettlementItem).toHaveBeenCalledWith(
      10,
      77,
      51,
      expect.objectContaining({ status: 'completed' }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );

    await request(app.getHttpServer() as App)
      .post('/offboarding/requests/77/clearances')
      .send({
        clearance_type: 'finance',
        owner_company_user_id: 44,
        due_date: '2026-08-31',
      })
      .expect(201);

    expect(offboardingService.createClearance).toHaveBeenCalledWith(
      10,
      77,
      expect.objectContaining({
        clearance_type: 'finance',
        owner_company_user_id: 44,
      }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );

    await request(app.getHttpServer() as App)
      .post('/offboarding/requests/77/clearances/61/complete')
      .send({ status: 'cleared', remarks: 'No outstanding balances.' })
      .expect(201);

    expect(offboardingService.completeClearance).toHaveBeenCalledWith(
      10,
      77,
      61,
      expect.objectContaining({ status: 'cleared' }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );

    await request(app.getHttpServer() as App)
      .post('/offboarding/requests/77/approve')
      .send({ comments: 'Approved by HR' })
      .expect(201);

    expect(offboardingService.applyApprovalAction).toHaveBeenCalledWith(
      10,
      77,
      expect.objectContaining({
        approve: true,
        comments: 'Approved by HR',
      }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );

    await request(app.getHttpServer() as App)
      .get('/offboarding/requests/77/access-operations')
      .expect(200);

    expect(offboardingService.listAccessOperations).toHaveBeenCalledWith(
      10,
      77,
      expect.objectContaining({ companyMembershipId: 33 }),
    );

    await request(app.getHttpServer() as App)
      .post('/offboarding/requests/77/access-termination/emergency')
      .send({ reason: 'Immediate security lockout' })
      .expect(201);

    expect(offboardingService.emergencyTerminateAccess).toHaveBeenCalledWith(
      10,
      77,
      expect.objectContaining({ reason: 'Immediate security lockout' }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );

    await request(app.getHttpServer() as App)
      .post('/offboarding/requests/77/complete')
      .expect(201);

    expect(offboardingService.completeOffboardingRequest).toHaveBeenCalledWith(
      10,
      77,
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );

    await request(app.getHttpServer() as App)
      .post('/offboarding/requests/77/finalize')
      .expect(201);

    expect(offboardingService.finalizeOffboarding).toHaveBeenCalledWith(
      10,
      77,
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );
  });

  it('routes cancellation and rejection through audited request actions', async () => {
    currentUser = {
      ...currentUser,
      permissions: ['offboarding_requests:cancel'],
    };

    await request(app.getHttpServer() as App)
      .post('/offboarding/requests/77/reject')
      .send({ comments: 'Settlement incomplete' })
      .expect(201);

    expect(offboardingService.applyApprovalAction).toHaveBeenCalledWith(
      10,
      77,
      expect.objectContaining({
        approve: false,
        comments: 'Settlement incomplete',
      }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );

    await request(app.getHttpServer() as App)
      .post('/offboarding/requests/77/cancel')
      .send({ reason: 'Employee retained' })
      .expect(201);

    expect(offboardingService.cancelOffboardingRequest).toHaveBeenCalledWith(
      10,
      77,
      expect.objectContaining({ reason: 'Employee retained' }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.any(Object),
    );
  });
});
