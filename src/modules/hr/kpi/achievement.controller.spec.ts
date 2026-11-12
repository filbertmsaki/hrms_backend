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
import { AchievementController } from './achievement.controller';
import { AchievementService } from './achievement.service';

describe('Phase 3 achievement HTTP authorization', () => {
  let app: INestApplication;
  let actor: AuthenticatedUser | undefined;
  const service = {
    mine: jest.fn(async () => []),
    create: jest.fn(async () => ({ id: 9 })),
    pending: jest.fn(async () => []),
    decide: jest.fn(async () => ({ id: 9 })),
    download: jest.fn(),
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
      controllers: [AchievementController],
      providers: [
        { provide: AchievementService, useValue: service },
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
  beforeEach(() => Object.values(service).forEach((fn) => fn.mockClear()));
  it('derives personal achievements from session and rejects unauthenticated access', async () => {
    actor = { ...base, roles: ['EMPLOYEE'], employeeId: 12 };
    await request(app.getHttpServer())
      .get('/api/hr/kpi/me/achievements?employeeId=999')
      .expect(200);
    expect(service.mine).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 12 }),
    );
    actor = undefined;
    await request(app.getHttpServer())
      .get('/api/hr/kpi/me/achievements')
      .expect(401);
  });
  it('allows an employee draft but denies manager decisions and pending list', async () => {
    actor = { ...base, roles: ['EMPLOYEE'], employeeId: 12 };
    await request(app.getHttpServer())
      .post('/api/hr/kpi/achievements')
      .send({ assignmentId: 4 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/hr/kpi/achievements/9/approve')
      .send({ rowVersion: 1 })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/hr/kpi/achievements/pending')
      .expect(403);
  });
  it('validates review version and records the manager actor', async () => {
    actor = { ...base, roles: ['DEPARTMENT_MANAGER'], employeeId: 14 };
    await request(app.getHttpServer())
      .post('/api/hr/kpi/achievements/9/approve')
      .send({ rowVersion: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/hr/kpi/achievements/9/approve')
      .send({ rowVersion: 2, comments: 'Verified' })
      .expect(201);
    expect(service.decide).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 14 }),
      9,
      'approved',
      expect.objectContaining({ rowVersion: 2 }),
    );
  });
});
