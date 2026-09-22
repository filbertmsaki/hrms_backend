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
  id: 33,
  email: 'hr-org@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 10,
  companyMembershipId: 232,
  employeeId: 701,
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
import { DepartmentsController } from '../src/modules/hr/departments/departments.controller';
import { DepartmentsService } from '../src/modules/hr/departments/departments.service';
import { PositionsController } from '../src/modules/hr/positions/positions.controller';
import { PositionsService } from '../src/modules/hr/positions/positions.service';

describe('Department and position endpoints (e2e)', () => {
  let app: INestApplication;
  let departmentsService: Record<string, jest.Mock>;
  let positionsService: Record<string, jest.Mock>;
  let securityEventsService: { logBestEffort: jest.Mock };

  beforeEach(async () => {
    currentUser = {
      id: 33,
      email: 'hr-org@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 10,
      companyMembershipId: 232,
      employeeId: 701,
      roles: ['HR'],
      permissions: [],
    };
    departmentsService = {
      create: jest.fn().mockResolvedValue({ id: 21, name: 'Operations' }),
      findAll: jest.fn().mockResolvedValue([{ id: 21 }]),
      findOne: jest.fn().mockResolvedValue({ id: 21 }),
      update: jest.fn().mockResolvedValue({ id: 21, status: 'active' }),
      remove: jest.fn().mockResolvedValue(undefined),
      listPositions: jest.fn().mockResolvedValue([{ id: 31 }]),
      assignPosition: jest.fn().mockResolvedValue({ department_id: 21 }),
      removePosition: jest.fn().mockResolvedValue(undefined),
      listAccessAssignments: jest.fn().mockResolvedValue([{ user_id: 42 }]),
      grantAccess: jest.fn().mockResolvedValue({ user_id: 42 }),
      revokeAccess: jest.fn().mockResolvedValue(undefined),
    };
    positionsService = {
      create: jest.fn().mockResolvedValue({ id: 31, name: 'Ops Lead' }),
      findAll: jest.fn().mockResolvedValue([{ id: 31 }]),
      findOne: jest.fn().mockResolvedValue({ id: 31 }),
      update: jest.fn().mockResolvedValue({ id: 31, headcount: 3 }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    securityEventsService = {
      logBestEffort: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DepartmentsController, PositionsController],
      providers: [
        { provide: DepartmentsService, useValue: departmentsService },
        { provide: PositionsService, useValue: positionsService },
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

  it('protects department creation behind department create permission', async () => {
    await request(app.getHttpServer() as App)
      .post('/departments')
      .send({ name: 'Operations', code: 'OPS' })
      .expect(403);

    expect(departmentsService.create).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: ['departments:create'],
        }),
      }),
    );
  });

  it('routes department and position CRUD plus department-position assignments', async () => {
    currentUser = {
      ...currentUser,
      permissions: [
        'departments:create',
        'departments:read',
        'departments:update',
        'departments:delete',
        'departments:manage-access',
        'positions:create',
        'positions:read',
        'positions:update',
        'positions:delete',
        'positions:assign-department',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/departments')
      .send({
        name: 'Operations',
        code: 'OPS',
        branch_id: 11,
        position_ids: [31],
        status: 'active',
      })
      .expect(201);
    expect(departmentsService.create).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ branch_id: 11, position_ids: [31] }),
      expect.objectContaining({ companyMembershipId: 232 }),
    );

    await request(app.getHttpServer() as App)
      .post('/positions')
      .send({
        name: 'Ops Lead',
        code: 'OPS-LEAD',
        branch_id: 11,
        department_ids: [21],
        is_manager: true,
        headcount: 2,
        status: 'active',
      })
      .expect(201);
    expect(positionsService.create).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ department_ids: [21], headcount: 2 }),
      expect.objectContaining({ companyMembershipId: 232 }),
    );

    await request(app.getHttpServer() as App)
      .get('/departments?branch_id=11&status=active')
      .expect(200);
    expect(departmentsService.findAll).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ branch_id: 11, status: 'active' }),
      expect.objectContaining({ companyMembershipId: 232 }),
    );

    await request(app.getHttpServer() as App)
      .get('/positions?department_id=21&status=active')
      .expect(200);
    expect(positionsService.findAll).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ department_id: 21, status: 'active' }),
      expect.objectContaining({ companyMembershipId: 232 }),
    );

    await request(app.getHttpServer() as App)
      .post('/departments/21/positions')
      .send({ position_id: 31 })
      .expect(201);
    expect(departmentsService.assignPosition).toHaveBeenCalledWith(
      10,
      21,
      31,
      expect.objectContaining({ companyMembershipId: 232 }),
    );

    await request(app.getHttpServer() as App)
      .get('/departments/21/positions')
      .expect(200);
    expect(departmentsService.listPositions).toHaveBeenCalledWith(
      10,
      21,
      expect.objectContaining({ companyMembershipId: 232 }),
    );

    await request(app.getHttpServer() as App)
      .delete('/departments/21/positions/31')
      .expect(200);
    expect(departmentsService.removePosition).toHaveBeenCalledWith(
      10,
      21,
      31,
      expect.objectContaining({ companyMembershipId: 232 }),
    );

    await request(app.getHttpServer() as App)
      .patch('/positions/31')
      .send({ headcount: 3 })
      .expect(200);
    expect(positionsService.update).toHaveBeenCalledWith(
      10,
      31,
      expect.objectContaining({ headcount: 3 }),
      expect.objectContaining({ companyMembershipId: 232 }),
    );

    await request(app.getHttpServer() as App)
      .get('/departments/21/access')
      .expect(200);
    expect(departmentsService.listAccessAssignments).toHaveBeenCalledWith(
      10,
      21,
    );

    await request(app.getHttpServer() as App)
      .post('/departments/21/access/42')
      .expect(201);
    expect(departmentsService.grantAccess).toHaveBeenCalledWith(
      10,
      21,
      42,
      expect.objectContaining({ companyMembershipId: 232 }),
      expect.objectContaining({ ipAddress: expect.any(String) }),
    );

    await request(app.getHttpServer() as App)
      .delete('/departments/21/access/42')
      .expect(200);
    expect(departmentsService.revokeAccess).toHaveBeenCalledWith(
      10,
      21,
      42,
      expect.objectContaining({ companyMembershipId: 232 }),
      expect.objectContaining({ ipAddress: expect.any(String) }),
    );

    await request(app.getHttpServer() as App)
      .delete('/departments/21')
      .expect(200);
    expect(departmentsService.remove).toHaveBeenCalledWith(
      10,
      21,
      expect.objectContaining({ companyMembershipId: 232 }),
    );

    await request(app.getHttpServer() as App)
      .delete('/positions/31')
      .expect(200);
    expect(positionsService.remove).toHaveBeenCalledWith(
      10,
      31,
      expect.objectContaining({ companyMembershipId: 232 }),
    );
  });
});
