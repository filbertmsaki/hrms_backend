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
  id: 12,
  email: 'hr@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 10,
  companyMembershipId: 44,
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
import { EmployeeMovementsController } from '../src/modules/hr/employee-movements/employee-movements.controller';
import { EmployeeMovementsService } from '../src/modules/hr/employee-movements/employee-movements.service';

describe('Employee movement endpoints (e2e)', () => {
  let app: INestApplication;
  let movementsService: Record<string, jest.Mock>;
  let securityEventsService: { logBestEffort: jest.Mock };

  const movementPayload = {
    employee_id: 701,
    movement_type: 'COMPOSITE',
    title: 'Promotion and department transfer',
    reason: 'Taking over the regional people operations scope.',
    effective_date: '2026-10-01',
    new_branch_id: 2,
    new_department_id: 8,
    new_position_id: 13,
    new_grade_id: 5,
    new_cost_center_id: 4,
    new_manager_employee_id: 702,
    new_employment_type: 'full_time',
    salary_revision: {
      base_salary: '4500000.00',
      currency: 'TZS',
      salary_structure_code: 'OPS-L5',
      revision_reference: 'FY27-COMP-001',
      justification: 'Approved promotion package.',
    },
    metadata: {
      acknowledgement_required: true,
      source: 'e2e',
    },
  };

  beforeEach(async () => {
    currentUser = {
      id: 12,
      email: 'hr@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 10,
      companyMembershipId: 44,
      employeeId: 701,
      roles: ['HR'],
      permissions: [],
    };
    movementsService = {
      create: jest.fn().mockResolvedValue({ id: 88, ...movementPayload }),
      findAll: jest.fn().mockResolvedValue([{ id: 88 }]),
      findOne: jest.fn().mockResolvedValue({ id: 88 }),
      update: jest.fn().mockResolvedValue({ id: 88, title: 'Updated' }),
      remove: jest.fn().mockResolvedValue(undefined),
      submit: jest.fn().mockResolvedValue({ id: 88, status: 'SUBMITTED' }),
      cancel: jest.fn().mockResolvedValue({ id: 88, status: 'CANCELLED' }),
      reject: jest.fn().mockResolvedValue({ id: 88, status: 'REJECTED' }),
      returnForCorrection: jest
        .fn()
        .mockResolvedValue({ id: 88, status: 'RETURNED' }),
      approve: jest.fn().mockResolvedValue({ id: 88, status: 'APPROVED' }),
      apply: jest.fn().mockResolvedValue({ id: 88, status: 'APPLIED' }),
      generateLetter: jest.fn().mockResolvedValue({
        id: 31,
        letter_type: 'PROMOTION',
      }),
      findOperations: jest.fn().mockResolvedValue([{ id: 15 }]),
      retryOperation: jest.fn().mockResolvedValue({
        id: 15,
        status: 'PENDING',
      }),
    };
    securityEventsService = {
      logBestEffort: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [EmployeeMovementsController],
      providers: [
        { provide: EmployeeMovementsService, useValue: movementsService },
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

  it('protects creation behind the employee movement create permission', async () => {
    await request(app.getHttpServer() as App)
      .post('/employee-movements')
      .send(movementPayload)
      .expect(403);

    expect(movementsService.create).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: ['employee_movements:create'],
        }),
      }),
    );
  });

  it('routes draft CRUD and submission through tenant-scoped service calls', async () => {
    currentUser = {
      ...currentUser,
      permissions: [
        'employee_movements:create',
        'employee_movements:read',
        'employee_movements:submit',
        'employee_movements:cancel',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/employee-movements')
      .send(movementPayload)
      .expect(201);

    expect(movementsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10, companyMembershipId: 44 }),
      expect.objectContaining({
        employee_id: 701,
        movement_type: 'COMPOSITE',
        salary_revision: expect.objectContaining({
          base_salary: '4500000.00',
        }),
      }),
    );

    await request(app.getHttpServer() as App)
      .get('/employee-movements?employee_id=701&status=DRAFT')
      .expect(200);

    expect(movementsService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10, companyMembershipId: 44 }),
      expect.objectContaining({ employee_id: 701, status: 'DRAFT' }),
    );

    await request(app.getHttpServer() as App)
      .get('/employee-movements/88')
      .expect(200);

    expect(movementsService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10, companyMembershipId: 44 }),
      88,
    );

    await request(app.getHttpServer() as App)
      .patch('/employee-movements/88')
      .send({ title: 'Updated' })
      .expect(200);

    expect(movementsService.update).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10, companyMembershipId: 44 }),
      88,
      expect.objectContaining({ title: 'Updated' }),
    );

    await request(app.getHttpServer() as App)
      .post('/employee-movements/88/submit')
      .expect(201);
    expect(movementsService.submit).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 44 }),
      88,
    );

    await request(app.getHttpServer() as App)
      .post('/employee-movements/88/cancel')
      .expect(201);
    expect(movementsService.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 44 }),
      88,
    );

    await request(app.getHttpServer() as App)
      .delete('/employee-movements/88')
      .expect(200);
    expect(movementsService.remove).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 44 }),
      88,
    );
  });

  it('routes approval, application, letters, and operation retry actions', async () => {
    currentUser = {
      ...currentUser,
      permissions: [
        'employee_movements:read',
        'employee_movements:approve',
        'employee_movements:apply',
        'employee_movements:generate-letter',
        'employee_movements:retry',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/employee-movements/88/approve')
      .send({ comments: 'Approved after compensation review.' })
      .expect(201);
    expect(movementsService.approve).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10, companyMembershipId: 44 }),
      88,
      expect.objectContaining({ comments: 'Approved after compensation review.' }),
    );

    await request(app.getHttpServer() as App)
      .post('/employee-movements/88/reject')
      .send({ comments: 'Budget was not approved.' })
      .expect(201);
    expect(movementsService.reject).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10, companyMembershipId: 44 }),
      88,
      'Budget was not approved.',
    );

    await request(app.getHttpServer() as App)
      .post('/employee-movements/88/return')
      .send({ comments: 'Attach updated department approval.' })
      .expect(201);
    expect(movementsService.returnForCorrection).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10, companyMembershipId: 44 }),
      88,
      'Attach updated department approval.',
    );

    await request(app.getHttpServer() as App)
      .post('/employee-movements/88/apply')
      .expect(201);
    expect(movementsService.apply).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 44 }),
      88,
    );

    await request(app.getHttpServer() as App)
      .post('/employee-movements/88/generate-letter')
      .send({ letter_type: 'PROMOTION' })
      .expect(201);
    expect(movementsService.generateLetter).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 44 }),
      88,
      'PROMOTION',
    );

    await request(app.getHttpServer() as App)
      .get('/employee-movements/88/operations')
      .expect(200);
    expect(movementsService.findOperations).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 44 }),
      88,
    );

    await request(app.getHttpServer() as App)
      .post('/employee-movements/88/operations/15/retry')
      .expect(201);
    expect(movementsService.retryOperation).toHaveBeenCalledWith(
      expect.objectContaining({ companyMembershipId: 44 }),
      88,
      15,
    );
  });
});
