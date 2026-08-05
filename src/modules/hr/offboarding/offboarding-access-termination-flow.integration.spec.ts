import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { OffboardingAccessOperationExecutorService } from './services/offboarding-access-operation-executor.service';
import { OffboardingAccessTerminationService } from './services/offboarding-access-termination.service';
import { OffboardingAccessOperationTypeEnum } from './enums/offboarding-access-operation-type.enum';
import { OffboardingAccessOperationStatusEnum } from './enums/offboarding-access-operation-status.enum';
import { OffboardingRequestStatusEnum } from './enums/offboarding-request-status.enum';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { User } from '../../users/entities/user.entity';
import { AccessGroupEmployee } from '../../access-control/access-group-employees/entity/access-group-employee.entity';
import { EmployeeAccessCredential } from '../../access-control/employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeDeviceAssignment } from '../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { OffboardingRequest } from './entities/offboarding-request.entity';
import { OffboardingAccessOperation } from './entities/offboarding-access-operation.entity';
import type { EmployeeAssignmentService } from '../employees/employee-assignment.service';
import type { AccessControlSyncService } from '../../access-control/service/access-control-sync.service';
import type { OffboardingLetterService } from './services/offboarding-letter.service';

/**
 * Exercises the real executor + orchestrator together (not just each in
 * isolation) to prove that a request seeded with the full access-operation
 * set (as completeOffboardingRequest creates) actually gets every identity
 * and access system flipped, and only reaches READY_FOR_FINALIZATION once
 * every operation is COMPLETED or SKIPPED.
 */
describe('Offboarding access-termination flow (integration)', () => {
  const ALL_OPERATION_TYPES = Object.values(OffboardingAccessOperationTypeEnum);

  const buildQueryBuilder = (overrides: Record<string, unknown> = {}) => {
    const builder: Record<string, jest.Mock> = {
      setLock: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      update: jest.fn(),
      set: jest.fn(),
      getOne: jest.fn().mockResolvedValue(null),
      getOneOrFail: jest.fn().mockRejectedValue(new Error('not stubbed')),
      getCount: jest.fn().mockResolvedValue(0),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    builder.setLock.mockReturnValue(builder);
    builder.where.mockReturnValue(builder);
    builder.andWhere.mockReturnValue(builder);
    builder.update.mockReturnValue(builder);
    builder.set.mockReturnValue(builder);
    Object.assign(builder, overrides);
    return builder;
  };

  it('deactivates identity/access systems and reaches READY_FOR_FINALIZATION', async () => {
    const companyId = 10;
    const employeeId = 501;
    const requestId = 77;

    const request = {
      id: requestId,
      company_id: companyId,
      employee_id: employeeId,
      last_working_date: '2026-08-31',
      employee: { company_user_id: 90 },
    } as unknown as OffboardingRequest;

    const operations = ALL_OPERATION_TYPES.map((type, index) => ({
      id: index + 1,
      offboarding_request_id: requestId,
      operation_type: type,
      status: OffboardingAccessOperationStatusEnum.PENDING,
      attempt_count: 0,
      started_at: null,
      completed_at: null,
      failed_at: null,
      last_error: null,
      metadata: null,
    })) as unknown as OffboardingAccessOperation[];
    const operationsById = new Map(operations.map((op) => [op.id, op]));

    const membership = {
      id: 90,
      user_id: 7,
      status: 'active',
      is_default: true,
    };
    const user = {
      id: 7,
      status: 'active',
      auth_token_version: 1,
      auth_token_invalid_before: null as Date | null,
    };

    const companyUserRepo = {
      createQueryBuilder: jest.fn(() =>
        buildQueryBuilder({ getOne: jest.fn().mockResolvedValue(membership) }),
      ),
      findOne: jest.fn().mockResolvedValue(membership),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn(async (entity: unknown) => entity),
    };
    const userRepo = {
      createQueryBuilder: jest.fn(() =>
        buildQueryBuilder({ getOne: jest.fn().mockResolvedValue(user) }),
      ),
      save: jest.fn(async (entity: unknown) => entity),
    };
    const accessGroupEmployeeRepo = {
      createQueryBuilder: jest.fn(() =>
        buildQueryBuilder({
          execute: jest.fn().mockResolvedValue({ affected: 2 }),
        }),
      ),
    };
    const employeeAccessCredentialRepo = {
      createQueryBuilder: jest.fn(() =>
        buildQueryBuilder({
          execute: jest.fn().mockResolvedValue({ affected: 3 }),
        }),
      ),
    };
    const employeeDeviceAssignmentRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    let lastRequestedOperationId: number | null = null;
    const operationRepoInManager = {
      createQueryBuilder: jest.fn(() => {
        const builder = buildQueryBuilder({
          getOneOrFail: jest.fn(() =>
            Promise.resolve(operationsById.get(lastRequestedOperationId!)!),
          ),
        });
        const originalWhere = builder.where;
        builder.where = jest.fn((clause: string, params?: { id?: number }) => {
          if (params?.id !== undefined) {
            lastRequestedOperationId = params.id;
          }
          return originalWhere(clause, params);
        });
        return builder;
      }),
      save: jest.fn(async (entity: OffboardingAccessOperation) => entity),
    };
    const requestRepoInManager = {
      createQueryBuilder: jest.fn(() =>
        buildQueryBuilder({
          getOne: jest.fn().mockResolvedValue(request),
          getOneOrFail: jest.fn().mockResolvedValue(request),
        }),
      ),
      save: jest.fn(async (entity: unknown) => entity),
    };

    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === OffboardingRequest) return requestRepoInManager;
        if (entity === OffboardingAccessOperation)
          return operationRepoInManager;
        if (entity === CompanyUser) return companyUserRepo;
        if (entity === User) return userRepo;
        if (entity === AccessGroupEmployee) return accessGroupEmployeeRepo;
        if (entity === EmployeeAccessCredential)
          return employeeAccessCredentialRepo;
        if (entity === EmployeeDeviceAssignment)
          return employeeDeviceAssignmentRepo;
        throw new Error(
          `Unexpected repository request: ${(entity as { name?: string })?.name}`,
        );
      }),
    } as unknown as EntityManager;

    const dataSource = {
      transaction: jest.fn(
        (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
      ),
    } as unknown as DataSource;

    const employeeAssignmentService = {
      endAssignmentsForExit: jest.fn(),
    } as unknown as EmployeeAssignmentService;
    const accessControlSyncService = {
      deleteEmployeeFromDevice: jest.fn(),
    } as unknown as AccessControlSyncService;
    const offboardingLetterService = {
      isLetterGenerated: jest.fn().mockResolvedValue(false),
      generateAndStore: jest.fn().mockResolvedValue({ id: 1 }),
    } as unknown as OffboardingLetterService;

    const executor = new OffboardingAccessOperationExecutorService(
      { get: jest.fn() } as unknown as ConfigService,
      employeeAssignmentService,
      accessControlSyncService,
      offboardingLetterService,
    );

    const service = new OffboardingAccessTerminationService(
      dataSource,
      {
        findOneOrFail: jest.fn().mockResolvedValue(request),
      } as unknown as Repository<OffboardingRequest>,
      {
        find: jest.fn().mockResolvedValue(operations),
      } as unknown as Repository<OffboardingAccessOperation>,
      executor,
    );

    // Simulate the dispatcher claiming the request: it must start out
    // scheduled, not already terminated.
    (request as { status: OffboardingRequestStatusEnum }).status =
      OffboardingRequestStatusEnum.TERMINATION_SCHEDULED;
    (
      request as { access_termination_attempt_count: number }
    ).access_termination_attempt_count = 0;

    const outcome = await service.processTermination(
      { companyId, offboardingRequestId: requestId },
      'worker-test',
    );

    expect(outcome.status).toBe('terminated');

    // Identity/access systems actually flipped, not just marked complete.
    expect(membership.status).toBe('inactive');
    expect(membership.is_default).toBe(false);
    expect(user.auth_token_invalid_before).not.toBeNull();
    expect(user.auth_token_version).toBe(2);
    expect(companyUserRepo.count).toHaveBeenCalled(); // deactivate-global-user check
    expect(
      employeeAssignmentService.endAssignmentsForExit,
    ).toHaveBeenCalledTimes(4); // branch/department/position/reporting
    expect(accessGroupEmployeeRepo.createQueryBuilder).toHaveBeenCalled();
    expect(employeeAccessCredentialRepo.createQueryBuilder).toHaveBeenCalled();

    // Every operation converged to a terminal, non-blocking state.
    for (const operation of operations) {
      expect([
        OffboardingAccessOperationStatusEnum.COMPLETED,
        OffboardingAccessOperationStatusEnum.SKIPPED,
      ]).toContain(operation.status);
    }

    // Only after every operation is terminal does the request advance.
    expect((request as { status: OffboardingRequestStatusEnum }).status).toBe(
      OffboardingRequestStatusEnum.READY_FOR_FINALIZATION,
    );
    expect(
      (request as { access_terminated_at: Date | null }).access_terminated_at,
    ).not.toBeNull();
  });

  it('leaves the request in ACCESS_TERMINATION_FAILED when a device removal fails, and does not deactivate the global user', async () => {
    const companyId = 10;
    const employeeId = 501;
    const requestId = 78;

    const request = {
      id: requestId,
      company_id: companyId,
      employee_id: employeeId,
      last_working_date: '2026-08-31',
      employee: { company_user_id: 90 },
      status: OffboardingRequestStatusEnum.TERMINATION_SCHEDULED,
      access_termination_attempt_count: 0,
    } as unknown as OffboardingRequest;

    const operations = [
      {
        id: 1,
        offboarding_request_id: requestId,
        operation_type: OffboardingAccessOperationTypeEnum.REMOVE_DEVICE_USER,
        status: OffboardingAccessOperationStatusEnum.PENDING,
        attempt_count: 0,
      },
    ] as unknown as OffboardingAccessOperation[];
    const operationsById = new Map(operations.map((op) => [op.id, op]));
    let lastRequestedOperationId: number | null = null;

    const operationRepoInManager = {
      createQueryBuilder: jest.fn(() => {
        const builder = buildQueryBuilder({
          getOneOrFail: jest.fn(() =>
            Promise.resolve(operationsById.get(lastRequestedOperationId!)!),
          ),
        });
        const originalWhere = builder.where;
        builder.where = jest.fn((_clause: string, params?: { id?: number }) => {
          if (params?.id !== undefined) {
            lastRequestedOperationId = params.id;
          }
          return originalWhere(_clause, params);
        });
        return builder;
      }),
      save: jest.fn(async (entity: OffboardingAccessOperation) => entity),
    };

    const requestRepoInManager = {
      createQueryBuilder: jest.fn(() =>
        buildQueryBuilder({
          getOne: jest.fn().mockResolvedValue(request),
          getOneOrFail: jest.fn().mockResolvedValue(request),
        }),
      ),
      save: jest.fn(async (entity: unknown) => entity),
    };

    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === OffboardingRequest) return requestRepoInManager;
        if (entity === OffboardingAccessOperation)
          return operationRepoInManager;
        if (entity === EmployeeDeviceAssignment)
          return {
            find: jest
              .fn()
              .mockResolvedValue([{ deviceId: 55, syncStatus: 'SYNCED' }]),
          };
        throw new Error(
          `Unexpected repository request: ${(entity as { name?: string })?.name}`,
        );
      }),
    } as unknown as EntityManager;

    const dataSource = {
      transaction: jest.fn(
        (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
      ),
    } as unknown as DataSource;

    const accessControlSyncService = {
      deleteEmployeeFromDevice: jest
        .fn()
        .mockRejectedValue(new Error('Hikvision device unreachable')),
    } as unknown as AccessControlSyncService;

    const executor = new OffboardingAccessOperationExecutorService(
      { get: jest.fn() } as unknown as ConfigService,
      {
        endAssignmentsForExit: jest.fn(),
      } as unknown as EmployeeAssignmentService,
      accessControlSyncService,
      {
        isLetterGenerated: jest.fn(),
        generateAndStore: jest.fn(),
      } as unknown as OffboardingLetterService,
    );

    const requestRepository = {
      findOneOrFail: jest.fn().mockResolvedValue(request),
      update: jest.fn(),
    } as unknown as Repository<OffboardingRequest>;

    const service = new OffboardingAccessTerminationService(
      dataSource,
      requestRepository,
      {
        find: jest.fn().mockResolvedValue(operations),
      } as unknown as Repository<OffboardingAccessOperation>,
      executor,
    );

    const outcome = await service.processTermination(
      { companyId, offboardingRequestId: requestId },
      'worker-test',
    );

    expect(outcome.status).toBe('failed');
    expect(operations[0].status).toBe(
      OffboardingAccessOperationStatusEnum.FAILED,
    );
    expect(requestRepository.update).toHaveBeenCalledWith(
      { id: requestId, company_id: companyId },
      expect.objectContaining({
        status: OffboardingRequestStatusEnum.ACCESS_TERMINATION_FAILED,
      }),
    );
  });
});
