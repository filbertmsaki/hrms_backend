import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { OffboardingAccessOperationExecutorService } from './offboarding-access-operation-executor.service';
import { OffboardingAccessOperationTypeEnum } from '../enums/offboarding-access-operation-type.enum';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { User } from '../../../users/entities/user.entity';
import { EmployeeDeviceAssignment } from '../../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../../../access-control/employee-device-assignments/enum/employee-device-assignment-sync-status.enum';
import type { EmployeeAssignmentService } from '../../employees/employee-assignment.service';
import type { AccessControlSyncService } from '../../../access-control/service/access-control-sync.service';
import type { OffboardingLetterService } from './offboarding-letter.service';
import type { OffboardingRequest } from '../entities/offboarding-request.entity';

const buildManager = (repoByEntity: Map<unknown, unknown>) =>
  ({
    getRepository: (entity: unknown) => repoByEntity.get(entity),
  }) as unknown as EntityManager;

describe('OffboardingAccessOperationExecutorService', () => {
  let executor: OffboardingAccessOperationExecutorService;
  let employeeAssignmentService: { endAssignmentsForExit: jest.Mock };
  let accessControlSyncService: { deleteEmployeeFromDevice: jest.Mock };
  let offboardingLetterService: {
    isLetterGenerated: jest.Mock;
    generateAndStore: jest.Mock;
  };

  const request = {
    id: 1,
    company_id: 10,
    employee_id: 501,
    last_working_date: '2026-08-31',
    employee: { company_user_id: 90 },
  } as unknown as OffboardingRequest;

  beforeEach(() => {
    employeeAssignmentService = { endAssignmentsForExit: jest.fn() };
    accessControlSyncService = { deleteEmployeeFromDevice: jest.fn() };
    offboardingLetterService = {
      isLetterGenerated: jest.fn().mockResolvedValue(false),
      generateAndStore: jest.fn().mockResolvedValue({ id: 1 }),
    };

    executor = new OffboardingAccessOperationExecutorService(
      { get: jest.fn() } as unknown as ConfigService,
      employeeAssignmentService as unknown as EmployeeAssignmentService,
      accessControlSyncService as unknown as AccessControlSyncService,
      offboardingLetterService as unknown as OffboardingLetterService,
    );
  });

  it('deactivates the company membership and clears is_default', async () => {
    const membership = { id: 90, status: 'active', is_default: true };
    const companyUserRepo = {
      createQueryBuilder: () => ({
        setLock: () => ({
          where: () => ({
            andWhere: () => ({
              getOne: async () => membership,
            }),
          }),
        }),
      }),
      save: jest.fn(async (entity) => entity),
    };

    const manager = buildManager(new Map([[CompanyUser, companyUserRepo]]));

    const result = await executor.execute(
      OffboardingAccessOperationTypeEnum.DEACTIVATE_COMPANY_MEMBERSHIP,
      request,
      manager,
    );

    expect(result.skipped).toBe(false);
    expect(membership.status).toBe('inactive');
    expect(membership.is_default).toBe(false);
    expect(companyUserRepo.save).toHaveBeenCalledWith(membership);
  });

  it('keeps the global user active when another company membership remains active', async () => {
    const membership = { id: 90, user_id: 7, status: 'active' };
    const user = { id: 7, status: 'active' };
    const companyUserRepo = {
      findOne: async () => membership,
      count: async () => 1,
    };
    const userRepo = {
      createQueryBuilder: () => ({
        setLock: () => ({
          where: () => ({
            getOne: async () => user,
          }),
        }),
      }),
      save: jest.fn(async (entity) => entity),
    };

    const manager = buildManager(
      new Map<unknown, unknown>([
        [CompanyUser, companyUserRepo],
        [User, userRepo],
      ]),
    );

    const result = await executor.execute(
      OffboardingAccessOperationTypeEnum.DEACTIVATE_GLOBAL_USER_IF_UNUSED,
      request,
      manager,
    );

    expect(result.skipped).toBe(true);
    expect(user.status).toBe('active');
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('deactivates the global user once no active memberships remain', async () => {
    const membership = { id: 90, user_id: 7, status: 'inactive' };
    const user = { id: 7, status: 'active' };
    const companyUserRepo = {
      findOne: async () => membership,
      count: async () => 0,
    };
    const userRepo = {
      createQueryBuilder: () => ({
        setLock: () => ({
          where: () => ({
            getOne: async () => user,
          }),
        }),
      }),
      save: jest.fn(async (entity) => entity),
    };

    const manager = buildManager(
      new Map<unknown, unknown>([
        [CompanyUser, companyUserRepo],
        [User, userRepo],
      ]),
    );

    const result = await executor.execute(
      OffboardingAccessOperationTypeEnum.DEACTIVATE_GLOBAL_USER_IF_UNUSED,
      request,
      manager,
    );

    expect(result.skipped).toBe(false);
    expect(user.status).toBe('inactive');
    expect(userRepo.save).toHaveBeenCalledWith(user);
  });

  it('fails the operation when a device removal call throws, rather than silently succeeding', async () => {
    accessControlSyncService.deleteEmployeeFromDevice.mockRejectedValue(
      new Error('Hikvision device unreachable'),
    );

    const assignments = [
      {
        deviceId: 55,
        syncStatus: EmployeeDeviceAssignmentSyncStatusEnum.SYNCED,
      },
    ];
    const deviceAssignmentRepo = {
      find: async () => assignments,
    };

    const manager = buildManager(
      new Map([[EmployeeDeviceAssignment, deviceAssignmentRepo]]),
    );

    await expect(
      executor.execute(
        OffboardingAccessOperationTypeEnum.REMOVE_DEVICE_USER,
        request,
        manager,
      ),
    ).rejects.toThrow(/Hikvision device unreachable/);
  });

  it('treats a device with no remaining assignment as idempotently complete', async () => {
    const deviceAssignmentRepo = { find: async () => [] };
    const manager = buildManager(
      new Map([[EmployeeDeviceAssignment, deviceAssignmentRepo]]),
    );

    const result = await executor.execute(
      OffboardingAccessOperationTypeEnum.REMOVE_DEVICE_USER,
      request,
      manager,
    );

    expect(result.skipped).toBe(true);
    expect(accessControlSyncService.deleteEmployeeFromDevice).not.toHaveBeenCalled();
  });

  it('delegates org-assignment termination to EmployeeAssignmentService', async () => {
    const manager = buildManager(new Map());

    await executor.execute(
      OffboardingAccessOperationTypeEnum.END_BRANCH_ACCESS,
      request,
      manager,
    );

    expect(employeeAssignmentService.endAssignmentsForExit).toHaveBeenCalledWith(
      request.company_id,
      request.employee_id,
      request.last_working_date,
      expect.anything(),
      manager,
    );
  });
});
