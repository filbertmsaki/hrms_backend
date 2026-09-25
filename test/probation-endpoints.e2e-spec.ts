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
  email: 'manager@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 10,
  companyMembershipId: 33,
  employeeId: 501,
  roles: ['Manager'],
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
import { ProbationController } from '../src/modules/hr/probation/probation.controller';
import { ProbationService } from '../src/modules/hr/probation/probation.service';
import { ProbationLetterService } from '../src/modules/hr/probation/services/probation-letter.service';

describe('Probation endpoints (e2e)', () => {
  let app: INestApplication;
  let probationService: Record<string, jest.Mock>;
  let securityEventsService: { logBestEffort: jest.Mock };

  beforeEach(async () => {
    currentUser = {
      id: 9,
      email: 'manager@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 10,
      companyMembershipId: 33,
      employeeId: 501,
      roles: ['Manager'],
      permissions: [],
    };
    probationService = {
      createPolicy: jest.fn().mockResolvedValue({ id: 1 }),
      listPolicies: jest.fn().mockResolvedValue([]),
      updatePolicy: jest.fn().mockResolvedValue({ id: 1 }),
      deletePolicy: jest.fn().mockResolvedValue(undefined),
      getDashboardSummary: jest.fn().mockResolvedValue({
        total_active: 2,
        due_for_review: 1,
      }),
      listCases: jest.fn().mockResolvedValue([{ id: 18 }]),
      createCaseManually: jest.fn().mockResolvedValue({ id: 18 }),
      updateCaseManually: jest.fn().mockResolvedValue({ id: 18 }),
      createObjective: jest.fn().mockResolvedValue({ id: 91 }),
      listMyTeamCases: jest.fn().mockResolvedValue([{ id: 18 }]),
      getCase: jest.fn().mockResolvedValue({ id: 18 }),
      deleteCase: jest.fn().mockResolvedValue(undefined),
      submitManagerReview: jest.fn().mockResolvedValue({
        id: 18,
        status: 'HR_REVIEW_PENDING',
      }),
      submitHrDecision: jest.fn().mockResolvedValue({
        id: 18,
        status: 'CONFIRMED',
      }),
      generateLetter: jest.fn().mockResolvedValue({
        id: 77,
        letter_type: 'CONFIRMATION',
      }),
    };
    securityEventsService = {
      logBestEffort: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ProbationController],
      providers: [
        { provide: ProbationService, useValue: probationService },
        { provide: ProbationLetterService, useValue: {} },
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

  it('protects manager review submission behind probation review permission', async () => {
    await request(app.getHttpServer() as App)
      .post('/probation/cases/18/manager-review')
      .send({
        ratings: [{ criterion_code: 'QUALITY', rating: 4 }],
        recommendation: 'CONFIRM',
        comments: 'Ready for confirmation.',
      })
      .expect(403);

    expect(probationService.submitManagerReview).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: [
            'probation_reviews:manager-review',
            'probation_reviews:manager-review-any',
          ],
        }),
      }),
    );
  });

  it('routes manager dashboard and team case views through actor-scoped service calls', async () => {
    currentUser = {
      ...currentUser,
      permissions: ['manager_self_service:read'],
    };

    await request(app.getHttpServer() as App)
      .get('/probation/dashboard/summary')
      .expect(200);

    expect(probationService.getDashboardSummary).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 33, employeeId: 501 }),
    );

    await request(app.getHttpServer() as App)
      .get('/probation/cases/my-team?status=MANAGER_REVIEW_PENDING')
      .expect(200);

    expect(probationService.listMyTeamCases).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 33, employeeId: 501 }),
      expect.objectContaining({ status: 'MANAGER_REVIEW_PENDING' }),
    );
  });

  it('routes objective creation, manager review, HR decision, and letter generation through tenant-scoped service calls', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      roles: ['HR'],
      permissions: [
        'probation_objectives:create',
        'probation_reviews:manager-review-any',
        'probation_reviews:hr-decision',
        'probation_letters:generate',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/probation/cases/18/objectives')
      .send({
        title: 'Complete onboarding goals',
        expected_result: 'All core onboarding goals completed.',
        weight: 50,
        due_date: '2026-08-31',
      })
      .expect(201);

    expect(probationService.createObjective).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10, companyMembershipId: 33 }),
      18,
      expect.objectContaining({
        title: 'Complete onboarding goals',
        weight: 50,
      }),
    );

    await request(app.getHttpServer() as App)
      .post('/probation/cases/18/manager-review')
      .send({
        ratings: [
          {
            criterion_code: 'QUALITY',
            rating: 4,
            comment: 'Consistent delivery.',
          },
        ],
        objectives: [
          {
            objective_id: 91,
            rating: 5,
            comment: 'Completed all onboarding objectives.',
          },
        ],
        recommendation: 'CONFIRM',
        comments: 'Ready for confirmation.',
      })
      .expect(201);

    expect(probationService.submitManagerReview).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10, companyMembershipId: 33 }),
      18,
      expect.objectContaining({
        ratings: [expect.objectContaining({ criterion_code: 'QUALITY' })],
        objectives: [expect.objectContaining({ objective_id: 91 })],
        recommendation: 'CONFIRM',
      }),
    );

    await request(app.getHttpServer() as App)
      .post('/probation/cases/18/hr-decision')
      .send({
        decision: 'CONFIRMED',
        comments: 'Confirmed after successful probation.',
        confirmation_date: '2026-08-31',
      })
      .expect(201);

    expect(probationService.submitHrDecision).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10, companyMembershipId: 33 }),
      18,
      expect.objectContaining({
        decision: 'CONFIRMED',
        confirmation_date: '2026-08-31',
      }),
    );

    await request(app.getHttpServer() as App)
      .post('/probation/cases/18/generate-letter')
      .send({ letter_type: 'CONFIRMATION' })
      .expect(201);

    expect(probationService.generateLetter).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10, companyMembershipId: 33 }),
      18,
      'CONFIRMATION',
    );

    await request(app.getHttpServer() as App)
      .post('/probation/cases/18/generate-letter')
      .send({})
      .expect(201);

    expect(probationService.generateLetter).toHaveBeenLastCalledWith(
      expect.objectContaining({ companyId: 10, companyMembershipId: 33 }),
      18,
      undefined,
    );
  });
});
