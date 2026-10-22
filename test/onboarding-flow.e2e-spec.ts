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
import { OnboardingController } from '../src/modules/hr/onboarding/onboarding.controller';
import { OnboardingService } from '../src/modules/hr/onboarding/onboarding.service';
import { OnboardingWorkspaceService } from '../src/modules/hr/onboarding/services/onboarding-workspace.service';

describe('Onboarding flow endpoints (e2e)', () => {
  let app: INestApplication;
  let onboardingService: Record<string, jest.Mock>;
  let workspaceService: Record<string, jest.Mock>;
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

    onboardingService = {
      createOnboardingWorkflow: jest.fn().mockResolvedValue({ id: 91 }),
      findAllOnboardingWorkflows: jest
        .fn()
        .mockResolvedValue({ data: [{ id: 91 }], meta: { total: 1 } }),
      findOneOnboardingWorkflow: jest.fn().mockResolvedValue({ id: 91 }),
      updateOnboardingWorkflow: jest.fn().mockResolvedValue({ id: 91 }),
      createOnboardingWorkflowStep: jest.fn().mockResolvedValue({ id: 12 }),
      updateOnboardingWorkflowStep: jest.fn().mockResolvedValue({ id: 12 }),
      removeOnboardingWorkflowStep: jest
        .fn()
        .mockResolvedValue({ message: 'Workflow step deleted successfully' }),
      removeOnboardingWorkflow: jest
        .fn()
        .mockResolvedValue({ message: 'Onboarding workflow deactivated' }),
      cloneOnboardingWorkflow: jest.fn().mockResolvedValue({ id: 92 }),
      createOnboardingRequest: jest.fn().mockResolvedValue({
        id: 55,
        employee_id: 501,
        status: 'submitted',
      }),
      updateOnboardingRequest: jest.fn().mockResolvedValue({ id: 55 }),
      findOneOnboardingRequest: jest.fn().mockResolvedValue({ id: 55 }),
      findAllOnboardingRequests: jest
        .fn()
        .mockResolvedValue({ data: [{ id: 55 }], meta: { total: 1 } }),
      completeOnboarding: jest.fn().mockResolvedValue({
        id: 55,
        status: 'completed',
        employee: { id: 501, employment_status: 'active' },
        probation: { id: 77, status: 'open' },
      }),
      cancelOnboarding: jest.fn().mockResolvedValue({
        id: 55,
        status: 'cancelled',
      }),
      addDocument: jest
        .fn()
        .mockResolvedValue({ id: 14, title: 'Offer Letter' }),
      listDocuments: jest.fn().mockResolvedValue([{ id: 14 }]),
      updateDocument: jest.fn().mockResolvedValue({ id: 14 }),
      verifyDocument: jest.fn().mockResolvedValue({
        id: 14,
        is_verified: true,
      }),
      removeDocument: jest
        .fn()
        .mockResolvedValue({ message: 'Onboarding document deleted' }),
      findAllTasks: jest.fn().mockResolvedValue([{ id: 31 }]),
      findOneTask: jest.fn().mockResolvedValue({ id: 31 }),
      reassignTask: jest.fn().mockResolvedValue({ id: 31 }),
      createTask: jest.fn().mockResolvedValue({ id: 31 }),
      completeTask: jest.fn().mockResolvedValue({
        id: 31,
        status: 'completed',
      }),
      applyApprovalAction: jest.fn().mockResolvedValue({
        id: 55,
        status: 'in_progress',
      }),
      delegateApproval: jest.fn().mockResolvedValue({ id: 41 }),
      getOnboardingProgress: jest.fn().mockResolvedValue({
        request_id: 55,
        progress_percentage: 80,
      }),
      getOnboardingAuditLogs: jest.fn().mockResolvedValue([{ id: 1 }]),
      getOverview: jest.fn().mockResolvedValue({
        data: [{ id: 55, stage: 'Contract' }],
        next_cursor: null,
      }),
      acknowledgeOnboarding: jest.fn().mockResolvedValue({
        id: 55,
        acknowledged_at: '2026-08-03T08:00:00.000Z',
      }),
    };
    securityEventsService = {
      logBestEffort: jest.fn().mockResolvedValue(undefined),
    };

    workspaceService = {
      notes: jest.fn().mockResolvedValue([]),
      addNote: jest.fn().mockResolvedValue({ message: 'Handoff note saved' }),
      visit: jest.fn().mockResolvedValue({ previous_viewed_at: null }),
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [
        { provide: OnboardingService, useValue: onboardingService },
        { provide: OnboardingWorkspaceService, useValue: workspaceService },
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

  it('guards handoff writes and validates notes before calling the scoped service', async () => {
    const note = {
      requirement_id: 'TIN',
      visibility: 'internal',
      client_key: 'c231fe9c-e752-4d88-99c0-072b16440151',
      body: 'Awaiting verification',
    };
    await request(app.getHttpServer() as App)
      .post('/onboarding/requests/55/workspace/notes')
      .send(note)
      .expect(403);
    await request(app.getHttpServer() as App)
      .get('/onboarding/requests/55/workspace/notes')
      .expect(403);
    expect(workspaceService.addNote).not.toHaveBeenCalled();
    currentUser.permissions = ['onboarding_requests:update'];
    for (const invalid of [
      { ...note, body: '  ' },
      { ...note, body: 'x'.repeat(2001) },
      { ...note, visibility: 'public' },
    ]) {
      await request(app.getHttpServer() as App)
        .post('/onboarding/requests/55/workspace/notes')
        .send(invalid)
        .expect(400);
    }
    expect(workspaceService.addNote).not.toHaveBeenCalled();
    await request(app.getHttpServer() as App)
      .post('/onboarding/requests/55/workspace/notes')
      .send(note)
      .expect(201);
    expect(workspaceService.addNote).toHaveBeenCalledWith(
      10,
      55,
      currentUser,
      expect.objectContaining(note),
    );
  });

  it('always requests beneficiary-only visibility from the employee messages endpoint', async () => {
    await request(app.getHttpServer() as App)
      .get('/onboarding/requests/55/workspace/my-notes')
      .expect(200);
    expect(workspaceService.notes).toHaveBeenCalledWith(
      10,
      55,
      currentUser,
      true,
    );
    await request(app.getHttpServer() as App)
      .post('/onboarding/requests/55/workspace/visit')
      .expect(403);
    currentUser.permissions = ['onboarding_requests:read'];
    await request(app.getHttpServer() as App)
      .post('/onboarding/requests/55/workspace/visit')
      .expect(201);
    expect(workspaceService.visit).toHaveBeenCalledWith(10, 55, currentUser);
  });

  it('protects the overview and validates its cursor without matching the request-id route', async () => {
    await request(app.getHttpServer() as App)
      .get('/onboarding/requests/overview')
      .expect(403);
    expect(onboardingService.getOverview).not.toHaveBeenCalled();
    currentUser.permissions = ['onboarding_requests:read'];
    for (const after of ['-1', 'bad', '1.5']) {
      await request(app.getHttpServer() as App)
        .get(`/onboarding/requests/overview?after=${after}`)
        .expect(400);
    }
    await request(app.getHttpServer() as App)
      .get('/onboarding/requests/overview?after=50')
      .expect(200);
    expect(onboardingService.getOverview).toHaveBeenCalledWith(
      10,
      50,
      currentUser,
    );
    expect(onboardingService.findOneOnboardingRequest).not.toHaveBeenCalled();
  });

  it('protects onboarding request listing behind read permission', async () => {
    await request(app.getHttpServer() as App)
      .get('/onboarding/requests?page=1&limit=20')
      .expect(403);

    expect(onboardingService.findAllOnboardingRequests).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: ['onboarding_requests:read'],
          missing_permissions: ['onboarding_requests:read'],
        }),
      }),
    );
  });

  it('routes an HR onboarding lifecycle through tenant-scoped service calls', async () => {
    currentUser = {
      ...currentUser,
      permissions: [
        'onboarding_requests:create',
        'onboarding_requests:read',
        'onboarding_requests:update',
        'onboarding_requests:approve',
        'onboarding_requests:complete',
        'onboarding_documents:create',
        'onboarding_documents:read',
        'onboarding_documents:update',
        'onboarding_documents:verify',
        'onboarding_tasks:create',
        'onboarding_tasks:read',
        'onboarding_tasks:update',
        'onboarding_tasks:complete',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/onboarding/requests')
      .send({
        employee_id: 501,
        workflow_id: 91,
        title: 'Onboard Asha',
        planned_start_date: '2026-08-03',
        planned_completion_date: '2026-08-07',
        submit: true,
        provisioning: {
          role_ids: [7],
          branch_access_ids: [3],
          shift_assignment: {
            shift_id: 11,
            effective_from: '2026-08-03',
          },
        },
      })
      .expect(201);

    expect(onboardingService.createOnboardingRequest).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        employee_id: 501,
        workflow_id: 91,
        submit: true,
        provisioning: expect.objectContaining({
          role_ids: [7],
          branch_access_ids: [3],
          shift_assignment: expect.objectContaining({ shift_id: 11 }),
        }),
      }),
      expect.objectContaining({ companyMembershipId: 33 }),
    );

    await request(app.getHttpServer() as App)
      .get(
        '/onboarding/requests?employee_id=501&status=submitted&page=1&limit=20',
      )
      .expect(200);

    expect(onboardingService.findAllOnboardingRequests).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        employee_id: 501,
        status: 'submitted',
        page: 1,
        limit: 20,
      }),
      expect.objectContaining({ companyId: 10 }),
    );

    await request(app.getHttpServer() as App)
      .post('/onboarding/requests/55/documents')
      .send({
        document_type: 'offer_letter',
        title: 'Offer Letter',
        file: {
          fileName: 'offer-letter.pdf',
          fileSize: 18,
          mimeType: 'application/pdf',
          fileString: Buffer.from('offer-letter').toString('base64'),
        },
      })
      .expect(201);

    expect(onboardingService.addDocument).toHaveBeenCalledWith(
      10,
      55,
      expect.objectContaining({
        document_type: 'offer_letter',
        title: 'Offer Letter',
      }),
      expect.objectContaining({ companyMembershipId: 33 }),
    );

    await request(app.getHttpServer() as App)
      .patch('/onboarding/requests/55/documents/14/verify')
      .send({ is_verified: true })
      .expect(200);

    expect(onboardingService.verifyDocument).toHaveBeenCalledWith(
      10,
      55,
      14,
      expect.objectContaining({ is_verified: true }),
      expect.objectContaining({ companyMembershipId: 33 }),
    );

    await request(app.getHttpServer() as App)
      .post('/onboarding/requests/55/tasks')
      .send({
        title: 'Prepare workstation',
        task_type: 'it',
        assigned_company_user_id: 44,
        due_date: '2026-08-04',
      })
      .expect(201);

    expect(onboardingService.createTask).toHaveBeenCalledWith(
      10,
      55,
      expect.objectContaining({
        title: 'Prepare workstation',
        task_type: 'it',
        assigned_company_user_id: 44,
      }),
      expect.objectContaining({ companyMembershipId: 33 }),
    );

    await request(app.getHttpServer() as App)
      .post('/onboarding/requests/55/tasks/31/complete')
      .send({
        completion_notes: 'Laptop and access card issued.',
        evidence_document_id: 14,
        completion_data: { asset_tag: 'LAP-501' },
      })
      .expect(201);

    expect(onboardingService.completeTask).toHaveBeenCalledWith(
      10,
      55,
      31,
      expect.objectContaining({
        completion_notes: 'Laptop and access card issued.',
        evidence_document_id: 14,
      }),
      expect.objectContaining({ companyMembershipId: 33 }),
    );

    await request(app.getHttpServer() as App)
      .post('/onboarding/requests/55/approve')
      .send({ approve: true, comments: 'Ready to provision' })
      .expect(201);

    expect(onboardingService.applyApprovalAction).toHaveBeenCalledWith(
      10,
      55,
      expect.objectContaining({
        approve: true,
        comments: 'Ready to provision',
      }),
      expect.objectContaining({ companyMembershipId: 33 }),
    );

    await request(app.getHttpServer() as App)
      .post('/onboarding/requests/55/acknowledge')
      .set('x-request-id', 'req-onboarding-55')
      .send({
        accepted: true,
        acknowledgement_version: 'v1',
      })
      .expect(201);

    expect(onboardingService.acknowledgeOnboarding).toHaveBeenCalledWith(
      10,
      55,
      expect.objectContaining({
        accepted: true,
        acknowledgement_version: 'v1',
      }),
      expect.objectContaining({ companyMembershipId: 33 }),
      expect.objectContaining({ requestId: 'req-onboarding-55' }),
    );

    await request(app.getHttpServer() as App)
      .post('/onboarding/requests/55/complete')
      .expect(201);

    expect(onboardingService.completeOnboarding).toHaveBeenCalledWith(
      10,
      55,
      expect.objectContaining({ companyMembershipId: 33 }),
    );
  });

  it('routes approval rejection and cancellation through audited request actions', async () => {
    currentUser = {
      ...currentUser,
      permissions: [
        'onboarding_requests:approve',
        'onboarding_requests:cancel',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/onboarding/requests/55/reject')
      .send({
        comments: 'Missing signed contract',
        signature_url: '/signatures/hr.png',
      })
      .expect(201);

    expect(onboardingService.applyApprovalAction).toHaveBeenCalledWith(
      10,
      55,
      expect.objectContaining({
        approve: false,
        comments: 'Missing signed contract',
        signature_url: '/signatures/hr.png',
      }),
      expect.objectContaining({ companyMembershipId: 33 }),
    );

    await request(app.getHttpServer() as App)
      .post('/onboarding/requests/55/cancel')
      .send({ reason: 'Candidate withdrew' })
      .expect(201);

    expect(onboardingService.cancelOnboarding).toHaveBeenCalledWith(
      10,
      55,
      expect.objectContaining({ reason: 'Candidate withdrew' }),
      expect.objectContaining({ companyMembershipId: 33 }),
    );
  });
});
