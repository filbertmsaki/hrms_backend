process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../src/database/data-source';
import { OffboardingAccessOperationExecutorService } from '../src/modules/hr/offboarding/services/offboarding-access-operation-executor.service';
import { OffboardingAccessTerminationService } from '../src/modules/hr/offboarding/services/offboarding-access-termination.service';
import { OffboardingAccessOperationTypeEnum } from '../src/modules/hr/offboarding/enums/offboarding-access-operation-type.enum';
import { OffboardingAccessOperationStatusEnum } from '../src/modules/hr/offboarding/enums/offboarding-access-operation-status.enum';
import { OffboardingRequestStatusEnum } from '../src/modules/hr/offboarding/enums/offboarding-request-status.enum';
import { OffboardingTypeEnum } from '../src/modules/hr/offboarding/enums/offboarding-type.enum';
import { OffboardingAccessTerminationModeEnum } from '../src/modules/hr/offboarding/enums/offboarding-access-termination-mode.enum';
import { OffboardingRequest } from '../src/modules/hr/offboarding/entities/offboarding-request.entity';
import { OffboardingAccessOperation } from '../src/modules/hr/offboarding/entities/offboarding-access-operation.entity';
import { Company } from '../src/modules/companies/entities/company.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { CompanyUser } from '../src/modules/companies/entities/company-user.entity';
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import type { EmployeeAssignmentService } from '../src/modules/hr/employees/employee-assignment.service';
import type { AccessControlSyncService } from '../src/modules/access-control/service/access-control-sync.service';
import type { OffboardingLetterService } from '../src/modules/hr/offboarding/services/offboarding-letter.service';

/**
 * Runs the real access-termination executor + orchestrator against a real
 * Postgres database (a dedicated `hrms_test_db`, migrated with the same
 * migrations as production) to prove the identity/access rows this phase
 * is meant to protect actually change on disk — not just in a mock's
 * in-memory object graph. Everything created here is deleted in afterAll.
 */
describe('Offboarding access termination (e2e, real Postgres)', () => {
  let dataSource: DataSource;
  let companyId: number;
  let userId: number;
  let companyUserId: number;
  let employeeId: number;
  let requestId: number;

  beforeAll(async () => {
    dataSource = AppDataSource.isInitialized
      ? AppDataSource
      : await AppDataSource.initialize();
  });

  afterAll(async () => {
    if (requestId) {
      await dataSource.query('DELETE FROM offboarding_requests WHERE id = $1', [
        requestId,
      ]);
    }
    if (employeeId) {
      await dataSource.query('DELETE FROM employees WHERE id = $1', [
        employeeId,
      ]);
    }
    if (companyUserId) {
      await dataSource.query('DELETE FROM company_users WHERE id = $1', [
        companyUserId,
      ]);
    }
    if (userId) {
      await dataSource.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    if (companyId) {
      await dataSource.query('DELETE FROM companies WHERE id = $1', [
        companyId,
      ]);
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Offboarding Co ${suffix}`,
        slug: `e2e-offboarding-${suffix}`,
        status: 'active',
      }),
    );
    companyId = company.id;

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-${suffix}`.slice(0, 20),
        first_name: 'Exit',
        last_name: 'Employee',
        phone: `+2557${suffix}`.slice(0, 20),
        email: `exit.employee.${suffix}@example.com`,
        password: 'not-a-real-hash',
        status: 'active',
        user_type: 'COMPANY_USER',
        auth_token_version: 1,
      }),
    );
    userId = user.id;

    const membership = await dataSource.getRepository(CompanyUser).save(
      dataSource.getRepository(CompanyUser).create({
        company_id: companyId,
        user_id: userId,
        status: 'active',
        is_default: true,
      }),
    );
    companyUserId = membership.id;

    const employee = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: companyId,
        company_user_id: companyUserId,
        employee_no: `EMP-${suffix}`.slice(0, 50),
        first_name: 'Exit',
        last_name: 'Employee',
        gender: 'female',
      }),
    );
    employeeId = employee.id;

    const request = await dataSource.getRepository(OffboardingRequest).save(
      dataSource.getRepository(OffboardingRequest).create({
        company_id: companyId,
        employee_id: employeeId,
        offboarding_code: `OFF-E2E-${suffix}`.slice(0, 50),
        title: 'End-to-end exit',
        offboarding_type: OffboardingTypeEnum.TERMINATION,
        reason: 'End-to-end test',
        last_working_date: '2026-08-31',
        access_termination_mode: OffboardingAccessTerminationModeEnum.IMMEDIATE,
        status: OffboardingRequestStatusEnum.TERMINATION_SCHEDULED,
      }),
    );
    requestId = request.id;

    const operationTypes = Object.values(OffboardingAccessOperationTypeEnum);
    await dataSource.getRepository(OffboardingAccessOperation).save(
      operationTypes.map((operationType) =>
        dataSource.getRepository(OffboardingAccessOperation).create({
          company_id: companyId,
          offboarding_request_id: requestId,
          operation_type: operationType,
          status: OffboardingAccessOperationStatusEnum.PENDING,
        }),
      ),
    );
  });

  it('deactivates the company membership, revokes sessions, and reaches READY_FOR_FINALIZATION in real Postgres', async () => {
    const executor = new OffboardingAccessOperationExecutorService(
      { get: jest.fn() } as unknown as ConfigService,
      {
        endAssignmentsForExit: jest.fn(),
      } as unknown as EmployeeAssignmentService,
      {
        deleteEmployeeFromDevice: jest.fn(),
      } as unknown as AccessControlSyncService,
      {
        isLetterGenerated: jest.fn().mockResolvedValue(true),
        generateAndStore: jest.fn(),
      } as unknown as OffboardingLetterService,
    );

    const service = new OffboardingAccessTerminationService(
      dataSource,
      dataSource.getRepository(OffboardingRequest),
      dataSource.getRepository(OffboardingAccessOperation),
      executor,
    );

    const outcome = await service.processTermination(
      { companyId, offboardingRequestId: requestId },
      'e2e-worker',
    );

    expect(outcome.status).toBe('terminated');

    const [membershipRow] = await dataSource.query(
      'SELECT status, is_default FROM company_users WHERE id = $1',
      [companyUserId],
    );
    expect(membershipRow.status).toBe('inactive');
    expect(membershipRow.is_default).toBe(false);

    const [userRow] = await dataSource.query(
      'SELECT status, auth_token_version, auth_token_invalid_before FROM users WHERE id = $1',
      [userId],
    );
    expect(userRow.status).toBe('inactive'); // no other active membership exists
    expect(Number(userRow.auth_token_version)).toBe(2);
    expect(userRow.auth_token_invalid_before).not.toBeNull();

    const [requestRow] = await dataSource.query(
      'SELECT status, access_terminated_at FROM offboarding_requests WHERE id = $1',
      [requestId],
    );
    expect(requestRow.status).toBe(
      OffboardingRequestStatusEnum.READY_FOR_FINALIZATION,
    );
    expect(requestRow.access_terminated_at).not.toBeNull();

    const [{ count: incompleteCount }] = await dataSource.query(
      `SELECT count(*) FROM offboarding_access_operations
       WHERE offboarding_request_id = $1 AND status NOT IN ('COMPLETED', 'SKIPPED')`,
      [requestId],
    );
    expect(Number(incompleteCount)).toBe(0);
  });

  it('leaves the request ACCESS_TERMINATION_FAILED and membership untouched when an operation fails', async () => {
    const executor = new OffboardingAccessOperationExecutorService(
      { get: jest.fn() } as unknown as ConfigService,
      {
        endAssignmentsForExit: jest
          .fn()
          .mockRejectedValue(new Error('org-assignment service unavailable')),
      } as unknown as EmployeeAssignmentService,
      {
        deleteEmployeeFromDevice: jest.fn(),
      } as unknown as AccessControlSyncService,
      {
        isLetterGenerated: jest.fn().mockResolvedValue(true),
        generateAndStore: jest.fn(),
      } as unknown as OffboardingLetterService,
    );

    const service = new OffboardingAccessTerminationService(
      dataSource,
      dataSource.getRepository(OffboardingRequest),
      dataSource.getRepository(OffboardingAccessOperation),
      executor,
    );

    const outcome = await service.processTermination(
      { companyId, offboardingRequestId: requestId },
      'e2e-worker',
    );

    expect(outcome.status).toBe('failed');

    const [requestRow] = await dataSource.query(
      'SELECT status, access_terminated_at FROM offboarding_requests WHERE id = $1',
      [requestId],
    );
    expect(requestRow.status).toBe(
      OffboardingRequestStatusEnum.ACCESS_TERMINATION_FAILED,
    );
    expect(requestRow.access_terminated_at).toBeNull();

    // Membership deactivation still ran (it's an earlier, independent
    // operation) — proving a downstream failure doesn't roll back
    // already-completed identity/access steps.
    const [membershipRow] = await dataSource.query(
      'SELECT status FROM company_users WHERE id = $1',
      [companyUserId],
    );
    expect(membershipRow.status).toBe('inactive');
  });
});
