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
import { KpiController } from './kpi.controller';
import { KpiRolesGuard } from './kpi-roles.guard';
import { KpiService } from './kpi.service';
import { KpiWorkflowService } from './kpi-workflow.service';

describe('KPI HTTP authorization and personal identity', () => {
  let app: INestApplication;
  let actor: AuthenticatedUser | undefined;
  const service = {
    createDefinition: jest.fn(async () => ({ id: 10 })),
    createAssignment: jest.fn(async () => ({ id: 11 })),
    personalAssignments: jest.fn(async () => [{ id: 8 }]),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [KpiController],
      providers: [
        { provide: KpiService, useValue: service },
        {
          provide: KpiWorkflowService,
          useValue: { resolveIssue: jest.fn().mockResolvedValue(undefined) },
        },
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
    service.createDefinition.mockClear();
    service.createAssignment.mockClear();
    service.personalAssignments.mockClear();
  });
  const base = {
    id: 1,
    email: 'test@example.invalid',
    scope: 'company' as const,
    userType: 'COMPANY_USER' as const,
    companyId: 3,
    companyMembershipId: 4,
    permissions: ['data_scope:company'],
  };

  it('accepts an authorized definition and validates its payload', async () => {
    actor = { ...base, roles: ['COMPANY_ADMIN'] };
    await request(app.getHttpServer())
      .post('/api/hr/kpi/definitions')
      .send({
        code: 'LOSS',
        name: 'Loss',
        category: 'Finance',
        measurementType: 'percentage',
        measurementUnit: '%',
        direction: 'lower',
        frequency: 'monthly',
      })
      .expect(201);
    expect(service.createDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 3 }),
      expect.objectContaining({ code: 'LOSS' }),
    );
    await request(app.getHttpServer())
      .post('/api/hr/kpi/definitions')
      .send({ code: 'LOSS' })
      .expect(400);
  });
  it('denies unauthorized writes and unauthenticated reads', async () => {
    actor = { ...base, roles: ['EMPLOYEE'], employeeId: 12 };
    await request(app.getHttpServer())
      .post('/api/hr/kpi/definitions')
      .send({})
      .expect(403);
    actor = undefined;
    await request(app.getHttpServer())
      .get('/api/hr/kpi/me/assignments')
      .expect(401);
  });
  it('lets a custom role with explicit assignment permission reach the assignment API', async () => {
    actor = {
      ...base,
      roles: ['TEST'],
      permissions: ['data_scope:department', 'kpi_assignments:create'],
    };
    await request(app.getHttpServer())
      .post('/api/hr/kpi/assignments')
      .send({
        definitionId: 4,
        periodId: 5,
        subjectType: 'employee',
        subjectId: 12,
        target: { value: 20 },
      })
      .expect(201);
    expect(service.createAssignment).toHaveBeenCalled();
    actor = {
      ...base,
      roles: ['TEST'],
      permissions: ['data_scope:department'],
    };
    await request(app.getHttpServer())
      .post('/api/hr/kpi/assignments')
      .send({
        definitionId: 4,
        periodId: 5,
        subjectType: 'employee',
        subjectId: 12,
        target: { value: 20 },
      })
      .expect(403);
  });
  it('derives personal access from the authenticated actor', async () => {
    actor = { ...base, roles: ['EMPLOYEE'], employeeId: 12 };
    await request(app.getHttpServer())
      .get('/api/hr/kpi/me/assignments?employeeId=999')
      .expect(200);
    expect(service.personalAssignments).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 12 }),
    );
  });
});
