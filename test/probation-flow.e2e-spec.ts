process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

const e2eUser = {
  id: 9,
  email: 'hr@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 10,
  companyMembershipId: 33,
  permissions: [
    'probation_policies:read',
    'probation_policies:create',
    'probation_policies:update',
    'probation_policies:delete',
    'probation_cases:read',
    'probation_cases:read-team',
    'probation_cases:delete',
    'probation_reviews:manager-review',
    'probation_reviews:hr-decision',
    'probation_letters:generate',
  ],
  roles: [],
};

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class MockJwtAuthGuard {
      canActivate(context: {
        switchToHttp: () => { getRequest: () => Record<string, unknown> };
      }) {
        const request = context.switchToHttp().getRequest();
        request.user = e2eUser;
        return true;
      }
    },
}));

import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProbationController } from '../src/modules/hr/probation/probation.controller';
import { ProbationService } from '../src/modules/hr/probation/probation.service';
import { ProbationCase } from '../src/modules/hr/probation/entities/probation-case.entity';
import { ProbationPolicy } from '../src/modules/hr/probation/entities/probation-policy.entity';
import { ProbationPolicyResolverService } from '../src/modules/hr/probation/services/probation-policy-resolver.service';
import { ProbationAuditService } from '../src/modules/hr/probation/services/probation-audit.service';
import { ProbationLetterService } from '../src/modules/hr/probation/services/probation-letter.service';
import { HrAccessService } from '../src/modules/hr/shared/hr-access.service';
import { ActionItemsService } from '../src/modules/hr/action-inbox/action-items.service';
import { OffboardingService } from '../src/modules/hr/offboarding/offboarding.service';
import { SecurityEventsService } from '../src/modules/security/security-events.service';

type MockRepo = Record<string, jest.Mock>;

const createRepositoryMock = (): MockRepo => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn((value: unknown) => value),
  save: jest.fn((value: unknown) => value),
  remove: jest.fn((value: unknown) => value),
});

describe('Probation Flow (e2e)', () => {
  let app: INestApplication;
  let dataSource: { transaction: jest.Mock };
  let caseRepository: MockRepo;
  let policyRepository: MockRepo;
  let hrAccessService: {
    assertCanAccessEmployee: jest.Mock;
    assertCompanyScopedActor: jest.Mock;
    ensureActorCompanyId: jest.Mock;
  };
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    dataSource = { transaction: jest.fn() };
    caseRepository = createRepositoryMock();
    policyRepository = createRepositoryMock();
    hrAccessService = {
      assertCanAccessEmployee: jest.fn(),
      assertCompanyScopedActor: jest.fn(),
      ensureActorCompanyId: jest.fn().mockReturnValue(10),
    };
    auditService = { log: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ProbationController],
      providers: [
        ProbationService,
        { provide: DataSource, useValue: dataSource },
        {
          provide: getRepositoryToken(ProbationCase),
          useValue: caseRepository,
        },
        {
          provide: getRepositoryToken(ProbationPolicy),
          useValue: policyRepository,
        },
        { provide: HrAccessService, useValue: hrAccessService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: ProbationPolicyResolverService,
          useValue: { resolvePolicyForEmployee: jest.fn() },
        },
        { provide: ActionItemsService, useValue: { upsert: jest.fn() } },
        { provide: ProbationAuditService, useValue: auditService },
        {
          provide: ProbationLetterService,
          useValue: { generateAndStore: jest.fn() },
        },
        {
          provide: OffboardingService,
          useValue: { createRequest: jest.fn() },
        },
        {
          provide: SecurityEventsService,
          useValue: { logBestEffort: jest.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('creates a probation policy through HTTP', async () => {
    const response = await request(app.getHttpServer() as App)
      .post('/probation/policies')
      .send({
        code: 'FT-90',
        name: 'Full time 90 days',
        probation_period_days: 90,
        effective_from: '2026-01-01',
        criteria: [
          { code: 'QUALITY', name: 'Quality of work', weight: 60 },
          { code: 'CONDUCT', name: 'Conduct', weight: 40 },
        ],
      })
      .expect(201);

    const body = response.body as { code: string; companyId: number };
    expect(body.code).toBe('FT-90');
    expect(body.companyId).toBe(10);
    expect(policyRepository.save).toHaveBeenCalledTimes(1);
  });

  it('rejects a policy whose criteria weights do not total 100', async () => {
    await request(app.getHttpServer() as App)
      .post('/probation/policies')
      .send({
        code: 'FT-90',
        name: 'Full time 90 days',
        probation_period_days: 90,
        effective_from: '2026-01-01',
        criteria: [{ code: 'QUALITY', name: 'Quality of work', weight: 60 }],
      })
      .expect(400);
  });

  it('lists probation policies through HTTP', async () => {
    policyRepository.find.mockResolvedValue([
      { id: 4, companyId: 10, code: 'FT-90', name: 'Full time 90 days' },
    ]);

    const response = await request(app.getHttpServer() as App)
      .get('/probation/policies')
      .expect(200);

    const body = response.body as Array<{ code: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].code).toBe('FT-90');
  });

  it('updates a probation policy, including its criteria', async () => {
    policyRepository.findOne.mockResolvedValue({
      id: 4,
      companyId: 10,
      code: 'FT-90',
      name: 'Full time 90 days',
      criteria: [{ code: 'QUALITY', name: 'Quality of work', weight: '60' }],
    });

    const response = await request(app.getHttpServer() as App)
      .patch('/probation/policies/4')
      .send({
        name: 'Full time 90 days (revised)',
        criteria: [
          { code: 'QUALITY', name: 'Quality of work', weight: 50 },
          { code: 'ATTENDANCE', name: 'Attendance', weight: 50 },
        ],
      })
      .expect(200);

    const body = response.body as { name: string; criteria: unknown[] };
    expect(body.name).toBe('Full time 90 days (revised)');
    expect(body.criteria).toHaveLength(2);
  });

  it('returns 404 when updating a policy that does not belong to the company', async () => {
    policyRepository.findOne.mockResolvedValue(null);

    await request(app.getHttpServer() as App)
      .patch('/probation/policies/999')
      .send({ name: 'Nope' })
      .expect(404);
  });

  it('deletes a probation policy through HTTP', async () => {
    policyRepository.findOne.mockResolvedValue({ id: 4, companyId: 10 });

    await request(app.getHttpServer() as App)
      .delete('/probation/policies/4')
      .expect(204);

    expect(policyRepository.remove).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when deleting a policy that does not exist', async () => {
    policyRepository.findOne.mockResolvedValue(null);

    await request(app.getHttpServer() as App)
      .delete('/probation/policies/404')
      .expect(404);
  });

  it('lists probation cases through HTTP', async () => {
    caseRepository.find.mockResolvedValue([
      { id: 18, companyId: 10, caseNo: 'PRB-2026-0001', status: 'ACTIVE' },
    ]);

    const response = await request(app.getHttpServer() as App)
      .get('/probation/cases')
      .expect(200);

    const body = response.body as Array<{ caseNo: string }>;
    expect(body[0].caseNo).toBe('PRB-2026-0001');
  });

  it('gets a single probation case through HTTP', async () => {
    caseRepository.findOne.mockResolvedValue({
      id: 18,
      companyId: 10,
      caseNo: 'PRB-2026-0001',
      status: 'ACTIVE',
      employee: { id: 501 },
    });

    const response = await request(app.getHttpServer() as App)
      .get('/probation/cases/18')
      .expect(200);

    const body = response.body as { caseNo: string };
    expect(body.caseNo).toBe('PRB-2026-0001');
    expect(hrAccessService.assertCanAccessEmployee).toHaveBeenCalledTimes(1);
  });

  it('deletes a probation case through HTTP and writes an audit log entry', async () => {
    caseRepository.findOne.mockResolvedValue({
      id: 18,
      companyId: 10,
      caseNo: 'PRB-2026-0001',
      status: 'ACTIVE',
      employee: { id: 501 },
    });

    await request(app.getHttpServer() as App)
      .delete('/probation/cases/18')
      .expect(204);

    expect(hrAccessService.assertCanAccessEmployee).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ probationCaseId: 18 }),
    );
    expect(caseRepository.remove).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when deleting a case that does not exist', async () => {
    caseRepository.findOne.mockResolvedValue(null);

    await request(app.getHttpServer() as App)
      .delete('/probation/cases/404')
      .expect(404);
  });

  it('rejects requests missing the required delete permission', async () => {
    e2eUser.permissions = e2eUser.permissions.filter(
      (permission) => permission !== 'probation_cases:delete',
    );
    caseRepository.findOne.mockResolvedValue({
      id: 18,
      companyId: 10,
      employee: { id: 501 },
    });

    await request(app.getHttpServer() as App)
      .delete('/probation/cases/18')
      .expect(403);

    e2eUser.permissions.push('probation_cases:delete');
  });
});
