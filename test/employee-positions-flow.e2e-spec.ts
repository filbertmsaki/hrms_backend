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
  id: 31,
  email: 'hr-positions@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 10,
  companyMembershipId: 230,
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
import { EmployeePositionsController } from '../src/modules/hr/employee-positions/employee-positions.controller';
import { EmployeePositionsService } from '../src/modules/hr/employee-positions/employee-positions.service';

describe('Employee position endpoints (e2e)', () => {
  let app: INestApplication;
  let employeePositionsService: Record<string, jest.Mock>;
  let securityEventsService: { logBestEffort: jest.Mock };

  beforeEach(async () => {
    currentUser = {
      id: 31,
      email: 'hr-positions@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 10,
      companyMembershipId: 230,
      employeeId: 701,
      roles: ['HR'],
      permissions: [],
    };
    employeePositionsService = {
      create: jest.fn().mockResolvedValue({ id: 51 }),
      findAll: jest.fn().mockResolvedValue([{ id: 51 }]),
      findOne: jest.fn().mockResolvedValue({ id: 51 }),
      update: jest.fn().mockResolvedValue({ id: 51, is_primary: false }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    securityEventsService = {
      logBestEffort: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [EmployeePositionsController],
      providers: [
        {
          provide: EmployeePositionsService,
          useValue: employeePositionsService,
        },
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

  it('protects employee position creation behind employee update permission', async () => {
    await request(app.getHttpServer() as App)
      .post('/employee-positions')
      .send({
        employee_id: 701,
        position_id: 31,
        start_date: '2026-09-01',
      })
      .expect(403);

    expect(employeePositionsService.create).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: ['employees:update'],
        }),
      }),
    );
  });

  it('routes assignment history lifecycle through tenant-scoped service calls', async () => {
    currentUser = {
      ...currentUser,
      permissions: ['employees:read', 'employees:update'],
    };

    await request(app.getHttpServer() as App)
      .post('/employee-positions')
      .send({
        employee_id: 701,
        position_id: 31,
        is_primary: true,
        start_date: '2026-09-01',
        assignment_type: 'PRIMARY',
        status: 'ACTIVE',
        notes: 'Primary position assignment.',
      })
      .expect(201);
    expect(employeePositionsService.create).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        employee_id: 701,
        position_id: 31,
        assignment_type: 'PRIMARY',
      }),
      expect.objectContaining({ companyMembershipId: 230 }),
    );

    await request(app.getHttpServer() as App)
      .get('/employee-positions?employee_id=701&status=ACTIVE&is_primary=true')
      .expect(200);
    expect(employeePositionsService.findAll).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        employee_id: 701,
        status: 'ACTIVE',
        is_primary: true,
      }),
      expect.objectContaining({ companyMembershipId: 230 }),
    );

    await request(app.getHttpServer() as App)
      .get('/employee-positions/51')
      .expect(200);
    expect(employeePositionsService.findOne).toHaveBeenCalledWith(
      10,
      51,
      expect.objectContaining({ companyMembershipId: 230 }),
    );

    await request(app.getHttpServer() as App)
      .patch('/employee-positions/51')
      .send({ is_primary: false, status: 'COMPLETED', end_date: '2026-12-31' })
      .expect(200);
    expect(employeePositionsService.update).toHaveBeenCalledWith(
      10,
      51,
      expect.objectContaining({
        is_primary: false,
        status: 'COMPLETED',
        end_date: '2026-12-31',
      }),
      expect.objectContaining({ companyMembershipId: 230 }),
    );

    await request(app.getHttpServer() as App)
      .delete('/employee-positions/51')
      .expect(200);
    expect(employeePositionsService.remove).toHaveBeenCalledWith(
      10,
      51,
      expect.objectContaining({ companyMembershipId: 230 }),
    );
  });
});
