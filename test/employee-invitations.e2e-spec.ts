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
import { EmployeeInvitationsController } from '../src/modules/hr/employee-invitations/employee-invitations.controller';
import { EmployeeInvitationsService } from '../src/modules/hr/employee-invitations/employee-invitations.service';

describe('Employee invitations endpoints (e2e)', () => {
  let app: INestApplication;
  let invitationsService: {
    findPending: jest.Mock;
    create: jest.Mock;
    resend: jest.Mock;
    findPublic: jest.Mock;
    accept: jest.Mock;
  };
  let securityEventsService: { logBestEffort: jest.Mock };

  const invitationPayload = {
    first_name: 'Amina',
    last_name: 'Moshi',
    gender: 'female',
    email: 'amina@example.com',
    phone: '+255712345678',
    primary_branch_id: 2,
    primary_department_id: 5,
    primary_position_id: 9,
    employment_type: 'full_time',
    onboarding_workflow_id: 3,
    channels: ['EMAIL', 'SMS'],
  };

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
    invitationsService = {
      findPending: jest.fn().mockResolvedValue([
        {
          id: 44,
          email: 'amina@example.com',
          status: 'pending',
        },
      ]),
      create: jest.fn().mockResolvedValue({
        id: 44,
        email: 'amina@example.com',
        status: 'pending',
      }),
      resend: jest.fn().mockResolvedValue({
        id: 44,
        status: 'pending',
        delivery: {
          email: { status: 'queued' },
          sms: { status: 'queued' },
        },
      }),
      findPublic: jest.fn().mockResolvedValue({
        first_name: 'Amina',
        last_name: 'Moshi',
        email: 'amina@example.com',
        status: 'pending',
      }),
      accept: jest.fn().mockResolvedValue({
        status: 'accepted',
        employee_id: 501,
        user_id: 77,
      }),
    };
    securityEventsService = {
      logBestEffort: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [EmployeeInvitationsController],
      providers: [
        { provide: EmployeeInvitationsService, useValue: invitationsService },
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

  it('protects pending invitation listing behind one of the onboarding/employee permissions', async () => {
    await request(app.getHttpServer() as App)
      .get('/employee-invitations')
      .expect(403);

    expect(invitationsService.findPending).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: [
            'employees:create',
            'onboarding_requests:read',
            'onboarding_workflows:read',
          ],
        }),
      }),
    );
  });

  it('routes invitation create, list, and resend through tenant-scoped service calls', async () => {
    currentUser = {
      ...currentUser,
      permissions: ['employees:create'],
    };

    await request(app.getHttpServer() as App)
      .post('/employee-invitations')
      .send(invitationPayload)
      .expect(201);

    expect(invitationsService.create).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        email: 'amina@example.com',
        phone: '+255712345678',
        onboarding_workflow_id: 3,
        channels: ['EMAIL', 'SMS'],
      }),
      expect.objectContaining({ companyMembershipId: 33 }),
    );

    await request(app.getHttpServer() as App)
      .get('/employee-invitations')
      .expect(200);

    expect(invitationsService.findPending).toHaveBeenCalledWith(10);

    await request(app.getHttpServer() as App)
      .post('/employee-invitations/44/resend')
      .expect(201);

    expect(invitationsService.resend).toHaveBeenCalledWith(10, 44);
  });

  it('allows public invitation lookup and acceptance with password validation', async () => {
    await request(app.getHttpServer() as App)
      .get('/employee-invitations/accept/invite-token')
      .expect(200);

    expect(invitationsService.findPublic).toHaveBeenCalledWith('invite-token');

    // Strength is enforced in the service (existing accounts confirm with
    // their current password), so the DTO only rejects missing/oversized input.
    await request(app.getHttpServer() as App)
      .post('/employee-invitations/accept/invite-token')
      .send({ password: '' })
      .expect(400);

    await request(app.getHttpServer() as App)
      .post('/employee-invitations/accept/invite-token')
      .send({ password: 'x'.repeat(129) })
      .expect(400);

    expect(invitationsService.accept).not.toHaveBeenCalled();

    await request(app.getHttpServer() as App)
      .post('/employee-invitations/accept/invite-token')
      .send({ password: 'StrongPass#2026' })
      .expect(201);

    expect(invitationsService.accept).toHaveBeenCalledWith('invite-token', {
      password: 'StrongPass#2026',
    });
  });
});
