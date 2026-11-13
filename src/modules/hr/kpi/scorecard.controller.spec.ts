import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import request from 'supertest';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { KpiRolesGuard } from './kpi-roles.guard';
import { ScorecardController } from './scorecard.controller';
import { ScorecardService } from './scorecard.service';

describe('Phase 2 scorecard HTTP authorization and validation', () => {
  let app: INestApplication;
  let actor: AuthenticatedUser | undefined;
  const service = {
    create: jest.fn(async () => ({ id: 10 })),
    mine: jest.fn(async () => [{ id: 10 }]),
    get: jest.fn(async () => ({ id: 10 })),
    preview: jest.fn(async () => ({ overallScore: null, exampleOnly: true })),
    createPolicy: jest.fn(async () => ({ id: 4 })),
  };
  const base = {
    id: 7,
    email: 'fixture@example.invalid',
    scope: 'company' as const,
    userType: 'COMPANY_USER' as const,
    companyId: 3,
    companyMembershipId: 8,
    permissions: ['data_scope:company'],
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ScorecardController],
      providers: [
        { provide: ScorecardService, useValue: service },
        KpiRolesGuard,
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate: () => {
          if (!actor) throw new UnauthorizedException();
          return true;
        },
      })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use((req, _res, next) => {
      req.user = actor;
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    Object.values(service).forEach((fn) => fn.mockClear());
  });
  it('validates scorecard configuration and allows a company administrator', async () => {
    actor = { ...base, roles: ['COMPANY_ADMIN'] };
    await request(app.getHttpServer())
      .post('/api/hr/kpi/scorecards')
      .send({ code: 'SC1' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/hr/kpi/scorecards')
      .send({
        code: 'SC1',
        name: 'Card',
        subjectType: 'employee',
        subjectId: 11,
        periodId: 12,
        mode: 'weighted',
        entries: [{ assignmentId: 5, weight: '100' }],
      })
      .expect(201);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 3 }),
      expect.objectContaining({ subjectId: 11 }),
    );
  });
  it('rejects an employee scorecard write and unauthenticated read', async () => {
    actor = { ...base, roles: ['EMPLOYEE'], employeeId: 11 };
    await request(app.getHttpServer())
      .post('/api/hr/kpi/scorecards')
      .send({})
      .expect(403);
    actor = undefined;
    await request(app.getHttpServer())
      .get('/api/hr/kpi/scorecards/me')
      .expect(401);
  });
  it('derives personal scorecards from the JWT actor, ignoring query IDs', async () => {
    actor = { ...base, roles: ['EMPLOYEE'], employeeId: 11 };
    await request(app.getHttpServer())
      .get('/api/hr/kpi/scorecards/me?employeeId=999')
      .expect(200);
    expect(service.mine).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 11 }),
    );
    await request(app.getHttpServer())
      .get('/api/hr/kpi/scorecards/10')
      .expect(200);
  });
  it('restricts policy writes and scoring previews to configured roles', async () => {
    actor = { ...base, roles: ['EMPLOYEE'], employeeId: 11 };
    await request(app.getHttpServer())
      .post('/api/hr/kpi/scoring-policies')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/hr/kpi/scorecards/10/preview')
      .send({ examples: [] })
      .expect(403);
    actor = { ...base, roles: ['DEPARTMENT_MANAGER'], employeeId: 12 };
    await request(app.getHttpServer())
      .post('/api/hr/kpi/scorecards/10/preview')
      .send({ examples: [] })
      .expect(201);
    expect(service.preview).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 12 }),
      10,
      expect.objectContaining({ examples: [] }),
    );
  });
});
