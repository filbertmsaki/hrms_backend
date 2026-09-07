import {
  INestApplication,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import request from 'supertest';
import { EntityManager } from 'typeorm';
import { HttpExceptionFilter } from '../../../common/filters/http-exception.filter';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { EmployeeAssignmentService } from './employee-assignment.service';
import { EmployeeImportService } from './import/employee-import.service';
import { Employee } from './entities/employee.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { User } from '../../users/entities/user.entity';
import { OnboardingController } from '../onboarding/onboarding.controller';
import { OnboardingService } from '../onboarding/onboarding.service';
import { OnboardingWorkflowService } from '../onboarding/services/onboarding-workflow.service';
import { OnboardingRequest } from '../onboarding/entities/onboarding-request.entity';
import { OnboardingApproval } from '../onboarding/entities/onboarding-approval.entity';
import { OnboardingWorkflowStep } from '../onboarding/entities/onboarding-workflow-step.entity';

jest.mock('digest-fetch', () => ({ __esModule: true, default: jest.fn() }));

// Exercise the real HTTP controllers, validation, exception filter and creation
// services with in-memory persistence and transaction rollback.
describe('Employee and onboarding creation HTTP contract', () => {
  let app: INestApplication;
  let employees: EmployeesService;
  let onboarding: OnboardingService;
  let employee: Partial<Employee> | null;
  let onboardingRequest: Partial<OnboardingRequest> | null;
  let committedEmployee: boolean;
  let eligible: jest.Mock;
  let persistEmployee: jest.Mock;
  let approvalsSave: jest.Mock;
  let auditLog: jest.Mock;
  const step = {
    id: 11,
    name: 'HR Document Collection',
    step_order: 1,
    is_required: true,
    assigned_role_id: 7,
    assigned_user_id: null,
    assigned_department_id: null,
  } as OnboardingWorkflowStep;
  const body = {
    first_name: 'Jane',
    last_name: 'Doe',
    gender: 'female',
    contacts: [
      {
        contact_type: 'personal',
        email: 'jane@example.com',
        phone_number: '+255762650393',
      },
    ],
  };

  beforeEach(async () => {
    employee = null;
    onboardingRequest = null;
    committedEmployee = false;
    const membership = { id: 26, company_id: 10, user_id: 6, status: 'active' };
    const employeeRepo = {
      findOne: jest.fn(async () => employee),
      create: jest.fn((value) => value),
    };
    const requestRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        onboardingRequest = { ...value, id: 55 };
        return onboardingRequest;
      }),
      findOneOrFail: jest.fn(async () => ({
        ...onboardingRequest,
        tasks: [],
        approvals: [],
      })),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => onboardingRequest),
      })),
    };
    approvalsSave = jest.fn(async (value) => value);
    const repositories = new Map<any, any>([
      [Employee, employeeRepo],
      [CompanyUser, { findOne: jest.fn(async () => membership) }],
      [
        User,
        {
          findOne: jest.fn(async () => ({
            id: 6,
            email: body.contacts[0].email,
            phone: body.contacts[0].phone_number,
          })),
        },
      ],
      [OnboardingRequest, requestRepo],
      [OnboardingApproval, { create: (value) => value, save: approvalsSave }],
    ]);
    const manager = {
      getRepository: (entity) => repositories.get(entity),
    } as EntityManager;
    const dataSource = {
      transaction: jest.fn(async (callback) => {
        const previousEmployee = structuredClone(employee);
        const previousRequest = structuredClone(onboardingRequest);
        try {
          const result = await callback(manager);
          committedEmployee = !!employee;
          return result;
        } catch (error) {
          employee = previousEmployee;
          onboardingRequest = previousRequest;
          throw error;
        }
      }),
    };
    eligible = jest.fn(async () => []);
    const workflow = {
      id: 1,
      version: 1,
      name: 'Standard Employee Onboarding Workflow',
      steps: [step],
    };
    const workflowService = Object.assign(
      Object.create(OnboardingWorkflowService.prototype),
      {
        resolveWorkflow: jest.fn(async () => workflow),
        resolveApproverMembershipIds: eligible,
      },
    );
    auditLog = jest.fn();
    onboarding = Object.assign(Object.create(OnboardingService.prototype), {
      dataSource,
      onboardingRequestRepository: requestRepo,
      onboardingWorkflowService: workflowService,
      findEmployeeOrFail: jest.fn(async () => {
        expect(committedEmployee).toBe(true);
        return { ...employee, company_user: membership };
      }),
      findOnboardingWorkflowOrFail: jest.fn(async () => workflow),
      generateOnboardingNo: jest.fn(async () => 'ONB-2026-000001'),
      lockWorkflowIfNeeded: jest.fn(),
      createTasksFromWorkflowSteps: jest.fn(),
      updateRequestProgress: jest.fn(async (value) => requestRepo.save(value)),
      onboardingAuditService: { log: auditLog },
      hrAccessService: {
        assertCompanyScopedActor: jest.fn(),
        assertCanAccessEmployee: jest.fn(),
      },
      emitOnboardingSubmitted: jest.fn(async () => undefined),
    });
    persistEmployee = jest.fn(async (_companyId, value) => {
      employee = { ...value, id: 123 };
      return employee;
    });
    employees = Object.assign(Object.create(EmployeesService.prototype), {
      dataSource,
      onboardingService: onboarding,
      logger: { warn: jest.fn() },
      employeeNumberService: {
        allocateNext: jest.fn(async () => 'EMP-000123'),
      },
      persistEmployee,
      initializeCurrentYearLeaveBalances: jest.fn(),
      employeeAssignmentService: { recordInitialAssignments: jest.fn() },
      securityEventsService: { log: jest.fn() },
      buildEmployeeAuditSnapshot: jest.fn(() => ({})),
      findOne: jest.fn(async () => employee),
    });
    const module = await Test.createTestingModule({
      controllers: [EmployeesController, OnboardingController],
      providers: [
        { provide: EmployeesService, useValue: employees },
        { provide: OnboardingService, useValue: onboarding },
        { provide: EmployeeAssignmentService, useValue: {} },
        { provide: EmployeeImportService, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use((req, _res, next) => {
      req.user = {
        id: 1,
        companyId: 10,
        companyMembershipId: 90,
        permissions: [],
        roles: [],
        scope: 'company',
      };
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('returns 201 employee plus draft and assignment warning when a required step has no approver', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/employees')
      .send({ ...body, onboarding: { submit: true } })
      .expect(201);
    expect(response.body).toMatchObject({
      id: 123,
      employee_no: 'EMP-000123',
      company_user_id: 26,
      onboarding_request: { id: 55, status: 'draft' },
      warning: expect.stringContaining(
        'Employee created; onboarding saved as draft',
      ),
      warning_details: [
        {
          id: 11,
          step_order: 1,
          name: step.name,
          assigned_role_id: 7,
          assigned_user_id: null,
        },
      ],
    });
    expect(approvalsSave).not.toHaveBeenCalled();
    expect(onboardingRequest?.submitted_at).toBeNull();
    expect(employee?.id).toBe(123);
  });

  it('returns the existing employee on same email/user retry', async () => {
    await request(app.getHttpServer())
      .post('/api/employees')
      .send({ ...body, onboarding: {} })
      .expect(201);
    const retry = await request(app.getHttpServer())
      .post('/api/employees')
      .send(body)
      .expect(409);
    expect(retry.body).toMatchObject({
      statusCode: 409,
      message: 'This company user already has an employee profile',
      employee_id: 123,
      employee: {
        id: 123,
        employee_no: 'EMP-000123',
        first_name: 'Jane',
        last_name: 'Doe',
      },
    });
    expect(persistEmployee).toHaveBeenCalledTimes(1);
  });

  it('creates an explicit draft without checking approvers', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/employees')
      .send({ ...body, onboarding: { submit: false } })
      .expect(201);
    expect(response.body).toMatchObject({
      id: 123,
      onboarding_request: { status: 'draft' },
      warning: null,
    });
    expect(eligible).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    { auto_start: false },
    { auto_start: false, submit: true },
  ])('skips onboarding for %j', async (flags) => {
    const response = await request(app.getHttpServer())
      .post('/api/employees')
      .send({ ...body, onboarding: flags })
      .expect(201);
    expect(response.body).toMatchObject({
      id: 123,
      onboarding_request: null,
      warning: null,
    });
    expect(onboardingRequest).toBeNull();
    expect(eligible).not.toHaveBeenCalled();
  });

  it.each([{ submit: true }, {}])(
    'submits with valid approvers and flags %j',
    async (flags) => {
      eligible.mockResolvedValue([26]);
      const response = await request(app.getHttpServer())
        .post('/api/employees')
        .send({ ...body, onboarding: flags })
        .expect(201);
      expect(response.body).toMatchObject({
        id: 123,
        onboarding_request: { status: 'submitted' },
        warning: null,
      });
      expect(approvalsSave).toHaveBeenCalled();
      expect(onboardingRequest?.submitted_at).toBeInstanceOf(Date);
    },
  );

  it('preserves employee success if onboarding cannot start at all', async () => {
    jest
      .spyOn(onboarding, 'startOnboardingForEmployee')
      .mockRejectedValue(new BadRequestException('No workflow'));
    const response = await request(app.getHttpServer())
      .post('/api/employees')
      .send({ ...body, onboarding: {} })
      .expect(201);
    expect(response.body).toMatchObject({
      id: 123,
      onboarding_request: null,
      warning: 'No workflow. Employee created.',
    });
  });

  it('returns the committed employee even if full profile loading fails', async () => {
    jest
      .spyOn(employees, 'findOne')
      .mockRejectedValue(new BadRequestException('Profile lookup failed'));
    const response = await request(app.getHttpServer())
      .post('/api/employees')
      .send(body)
      .expect(201);
    expect(response.body).toMatchObject({
      id: 123,
      employee_no: 'EMP-000123',
      company_user_id: 26,
      warning: expect.any(String),
    });
  });

  it.each([false, true, undefined])(
    'creates standalone onboarding with submit=%j',
    async (submit) => {
      await request(app.getHttpServer())
        .post('/api/employees')
        .send(body)
        .expect(201);
      const response = await request(app.getHttpServer())
        .post('/api/onboarding/requests')
        .send({ employee_id: 123, submit })
        .expect(201);
      expect(response.body).toMatchObject({
        id: 55,
        status: 'draft',
        warning: submit === false ? null : expect.any(String),
      });
      expect(eligible).toHaveBeenCalledTimes(submit === false ? 0 : 1);
      const retry = await request(app.getHttpServer())
        .post('/api/onboarding/requests')
        .send({ employee_id: 123, submit: false })
        .expect(409);
      expect(retry.body).toMatchObject({
        onboarding_request_id: 55,
        onboarding_request: { id: 55, status: 'draft' },
      });
    },
  );

  it('rejects missing employee_id before starting standalone onboarding', async () => {
    await request(app.getHttpServer())
      .post('/api/onboarding/requests')
      .send({ submit: false })
      .expect(400);
    expect(onboardingRequest).toBeNull();
  });

  it('submits standalone onboarding with valid approvers', async () => {
    await request(app.getHttpServer())
      .post('/api/employees')
      .send(body)
      .expect(201);
    eligible.mockResolvedValue([26]);
    const response = await request(app.getHttpServer())
      .post('/api/onboarding/requests')
      .send({ employee_id: 123, submit: true })
      .expect(201);
    expect(response.body).toMatchObject({
      id: 55,
      status: 'submitted',
      warning: null,
    });
    expect(approvalsSave).toHaveBeenCalled();
  });

  it.each(['submit', 'auto_start'])(
    'rejects non-boolean %s instead of silently submitting',
    async (flag) => {
      await request(app.getHttpServer())
        .post('/api/employees')
        .send({ ...body, onboarding: { [flag]: 'false' } })
        .expect(400);
      expect(employee).toBeNull();
    },
  );

  it('rolls onboarding back on a later error while returning the committed employee', async () => {
    auditLog.mockRejectedValue(new Error('Audit unavailable'));
    const response = await request(app.getHttpServer())
      .post('/api/employees')
      .send({ ...body, onboarding: { submit: false } })
      .expect(201);
    expect(response.body).toMatchObject({
      id: 123,
      onboarding_request: null,
      warning: expect.any(String),
    });
    expect(onboardingRequest).toBeNull();
    expect(employee?.id).toBe(123);
  });
});
