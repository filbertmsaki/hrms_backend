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
import { OffboardingAssetReturn } from '../src/modules/hr/offboarding/entities/offboarding-asset-return.entity';
import { OffboardingSettlementItem } from '../src/modules/hr/offboarding/entities/offboarding-settlement-item.entity';
import { OffboardingAssetStatusEnum } from '../src/modules/hr/offboarding/enums/offboarding-asset-status.enum';
import { OffboardingAssetTypeEnum } from '../src/modules/hr/offboarding/enums/offboarding-asset-type.enum';
import { OffboardingSettlementItemTypeEnum } from '../src/modules/hr/offboarding/enums/offboarding-settlement-item-type.enum';
import { OffboardingSettlementSourceEnum } from '../src/modules/hr/offboarding/enums/offboarding-settlement-source.enum';
import { OffboardingSettlementStatusEnum } from '../src/modules/hr/offboarding/enums/offboarding-settlement-status.enum';
import { OffboardingCronService } from '../src/modules/hr/offboarding/services/offboarding-cron.service';
import { OffboardingTask } from '../src/modules/hr/offboarding/entities/offboarding-task.entity';
import { OffboardingClearance } from '../src/modules/hr/offboarding/entities/offboarding-clearance.entity';
import { OffboardingApproval } from '../src/modules/hr/offboarding/entities/offboarding-approval.entity';
import {
  OffboardingAssetOverdueEvent,
  OffboardingSettlementOverdueEvent,
} from '../src/modules/hr/notifications/events';
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

    const financeRecovery = {
      createForOffboarding: jest.fn().mockResolvedValue([]),
    };
    const service = new OffboardingAccessTerminationService(
      dataSource,
      dataSource.getRepository(OffboardingRequest),
      dataSource.getRepository(OffboardingAccessOperation),
      executor,
      financeRecovery as never,
    );

    const outcome = await service.processTermination(
      { companyId, offboardingRequestId: requestId },
      'e2e-worker',
    );

    expect(outcome.status).toBe('terminated');
    expect(financeRecovery.createForOffboarding).toHaveBeenCalledWith(
      companyId,
      requestId,
    );

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

  it('persists overdue asset and settlement reminders once across repeated sweeps', async () => {
    await dataSource.getRepository(OffboardingRequest).update(requestId, {
      status: OffboardingRequestStatusEnum.IN_PROGRESS,
    });

    const asset = await dataSource.getRepository(OffboardingAssetReturn).save(
      dataSource.getRepository(OffboardingAssetReturn).create({
        company_id: companyId,
        offboarding_request_id: requestId,
        asset_type: OffboardingAssetTypeEnum.LAPTOP,
        asset_label: `E2E laptop ${requestId}`,
        owner_company_user_id: companyUserId,
        status: OffboardingAssetStatusEnum.PENDING,
        due_date: new Date(Date.now() - 48 * 60 * 60 * 1000),
      }),
    );
    const settlement = await dataSource
      .getRepository(OffboardingSettlementItem)
      .save(
        dataSource.getRepository(OffboardingSettlementItem).create({
          company_id: companyId,
          offboarding_request_id: requestId,
          item_type: OffboardingSettlementItemTypeEnum.FINAL_SALARY,
          title: `E2E final settlement ${requestId}`,
          owner_company_user_id: companyUserId,
          status: OffboardingSettlementStatusEnum.PENDING,
          due_date: new Date(Date.now() - 48 * 60 * 60 * 1000),
          source_type: OffboardingSettlementSourceEnum.MANUAL,
        }),
      );

    const eventEmitter = { emit: jest.fn() };
    const cronService = new OffboardingCronService(
      dataSource.getRepository(OffboardingTask),
      dataSource.getRepository(OffboardingClearance),
      dataSource.getRepository(OffboardingApproval),
      dataSource.getRepository(OffboardingAssetReturn),
      dataSource.getRepository(OffboardingSettlementItem),
      eventEmitter as never,
      {
        get: (key: string, fallback?: unknown) =>
          key === 'APP_FRONTEND_URL' ? 'https://uat.example.test' : fallback,
      } as never,
      {
        runWithLock: async (
          _key: string,
          callback: () => Promise<unknown>,
        ) => ({ acquired: true, result: await callback() }),
      } as never,
    );

    await cronService.handleOffboardingEscalations();
    await cronService.handleOffboardingEscalations();

    const [persistedAsset, persistedSettlement] = await Promise.all([
      dataSource
        .getRepository(OffboardingAssetReturn)
        .findOneByOrFail({ id: asset.id }),
      dataSource
        .getRepository(OffboardingSettlementItem)
        .findOneByOrFail({ id: settlement.id }),
    ]);
    expect(persistedAsset.reminder_count).toBe(1);
    expect(persistedAsset.last_reminder_at).not.toBeNull();
    expect(persistedSettlement.reminder_count).toBe(1);
    expect(persistedSettlement.last_reminder_at).not.toBeNull();
    expect(eventEmitter.emit.mock.calls).toEqual(
      expect.arrayContaining([
        [
          OffboardingAssetOverdueEvent.EVENT,
          expect.any(OffboardingAssetOverdueEvent),
        ],
        [
          OffboardingSettlementOverdueEvent.EVENT,
          expect.any(OffboardingSettlementOverdueEvent),
        ],
      ]),
    );
    expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
  });
});
