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
  id: 34,
  email: 'hr-support-data@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 10,
  companyMembershipId: 233,
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
import { CostCentersController } from '../src/modules/hr/cost-centers/cost-centers.controller';
import { CostCentersService } from '../src/modules/hr/cost-centers/cost-centers.service';
import { EmployeeGradesController } from '../src/modules/hr/grades/employee-grades.controller';
import { EmployeeGradesService } from '../src/modules/hr/grades/employee-grades.service';

describe('Grade and cost center endpoints (e2e)', () => {
  let app: INestApplication;
  let employeeGradesService: Record<string, jest.Mock>;
  let costCentersService: Record<string, jest.Mock>;
  let securityEventsService: { logBestEffort: jest.Mock };

  beforeEach(async () => {
    currentUser = {
      id: 34,
      email: 'hr-support-data@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 10,
      companyMembershipId: 233,
      employeeId: 701,
      roles: ['HR'],
      permissions: [],
    };
    employeeGradesService = {
      create: jest.fn().mockResolvedValue({ id: 41, code: 'G5' }),
      findAll: jest.fn().mockResolvedValue([{ id: 41 }]),
      findOne: jest.fn().mockResolvedValue({ id: 41 }),
      update: jest.fn().mockResolvedValue({ id: 41, status: 'active' }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    costCentersService = {
      create: jest.fn().mockResolvedValue({ id: 61, code: 'OPS-DSM' }),
      findAll: jest.fn().mockResolvedValue([{ id: 61 }]),
      findOne: jest.fn().mockResolvedValue({ id: 61 }),
      update: jest.fn().mockResolvedValue({ id: 61, status: 'active' }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    securityEventsService = {
      logBestEffort: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [EmployeeGradesController, CostCentersController],
      providers: [
        { provide: EmployeeGradesService, useValue: employeeGradesService },
        { provide: CostCentersService, useValue: costCentersService },
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

  it('protects grade creation behind grade create permission', async () => {
    await request(app.getHttpServer() as App)
      .post('/employee-grades')
      .send({ code: 'G5', name: 'Grade 5' })
      .expect(403);

    expect(employeeGradesService.create).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: ['employee_grades:create'],
        }),
      }),
    );
  });

  it('routes grade CRUD through tenant-scoped service calls', async () => {
    currentUser = {
      ...currentUser,
      permissions: [
        'employee_grades:create',
        'employee_grades:read',
        'employee_grades:update',
        'employee_grades:delete',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/employee-grades')
      .send({
        code: 'G5',
        name: 'Grade 5',
        level: 5,
        description: 'Senior specialist grade.',
        status: 'active',
      })
      .expect(201);
    expect(employeeGradesService.create).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ code: 'G5', level: 5 }),
    );

    await request(app.getHttpServer() as App)
      .get('/employee-grades')
      .expect(200);
    expect(employeeGradesService.findAll).toHaveBeenCalledWith(10);

    await request(app.getHttpServer() as App)
      .get('/employee-grades/41')
      .expect(200);
    expect(employeeGradesService.findOne).toHaveBeenCalledWith(10, 41);

    await request(app.getHttpServer() as App)
      .patch('/employee-grades/41')
      .send({ status: 'inactive' })
      .expect(200);
    expect(employeeGradesService.update).toHaveBeenCalledWith(
      10,
      41,
      expect.objectContaining({ status: 'inactive' }),
    );

    await request(app.getHttpServer() as App)
      .delete('/employee-grades/41')
      .expect(200);
    expect(employeeGradesService.remove).toHaveBeenCalledWith(10, 41);
  });

  it('routes cost center CRUD through tenant-scoped service calls', async () => {
    currentUser = {
      ...currentUser,
      permissions: [
        'cost_centers:create',
        'cost_centers:read',
        'cost_centers:update',
        'cost_centers:delete',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/cost-centers')
      .send({
        code: 'OPS-DSM',
        name: 'Operations Dar es Salaam',
        branch_id: 11,
        department_id: 21,
        description: 'Operations branch cost center.',
        status: 'active',
      })
      .expect(201);
    expect(costCentersService.create).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        code: 'OPS-DSM',
        branch_id: 11,
        department_id: 21,
      }),
    );

    await request(app.getHttpServer() as App)
      .get('/cost-centers')
      .expect(200);
    expect(costCentersService.findAll).toHaveBeenCalledWith(10);

    await request(app.getHttpServer() as App)
      .get('/cost-centers/61')
      .expect(200);
    expect(costCentersService.findOne).toHaveBeenCalledWith(10, 61);

    await request(app.getHttpServer() as App)
      .patch('/cost-centers/61')
      .send({ status: 'inactive' })
      .expect(200);
    expect(costCentersService.update).toHaveBeenCalledWith(
      10,
      61,
      expect.objectContaining({ status: 'inactive' }),
    );

    await request(app.getHttpServer() as App)
      .delete('/cost-centers/61')
      .expect(200);
    expect(costCentersService.remove).toHaveBeenCalledWith(10, 61);
  });
});
