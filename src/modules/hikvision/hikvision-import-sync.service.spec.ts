import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
jest.mock('digest-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));
import { AttendanceDevice } from '../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../access-control/attendance-devices/enums/attendance-device-status.enum';
import { AttendanceDeviceSyncModeEnum } from '../access-control/attendance-devices/enums/attendance-device-sync-mode.enum';
import { EmployeeDeviceAssignment } from '../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { AccessControlSyncService } from '../access-control/service/access-control-sync.service';
import { Employee } from '../hr/employees/entities/employee.entity';
import { HikvisionImportSyncService } from './hikvision-import-sync.service';
import {
  HikvisionSyncJobData,
  HikvisionSyncJobName,
} from './hikvision-sync-job.constants';

type MockRepo = Record<string, jest.Mock>;

const createRepositoryMock = (): MockRepo => ({
  find: jest.fn(),
});

describe('HikvisionImportSyncService', () => {
  let service: HikvisionImportSyncService;
  let queue: { add: jest.Mock };
  let employeeRepository: MockRepo;
  let assignmentRepository: MockRepo;
  let userManagementService: {
    searchUsersOnDevice: jest.Mock;
    syncUsersFromDeviceToBackend: jest.Mock;
  };
  let peopleCredentialSyncService: {
    syncAllFingerprintsForSyncedUsers: jest.Mock;
    syncCards: jest.Mock;
  };
  let attendanceSyncService: {
    syncLatestAttendanceWindow: jest.Mock;
    syncAttendance: jest.Mock;
  };
  let accessControlSyncService: {
    syncDeviceDoors: jest.Mock;
    syncDeviceWeekPlans: jest.Mock;
    syncDeviceTemplates: jest.Mock;
    generateVirtualGroups: jest.Mock;
  };
  const originalStartTime = process.env.HIKVISION_AUTO_SYNC_START_TIME;
  const originalTz = process.env.TZ;

  beforeEach(() => {
    jest.useRealTimers();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    queue = {
      add: jest.fn().mockResolvedValue(undefined),
    };
    employeeRepository = createRepositoryMock();
    assignmentRepository = createRepositoryMock();
    userManagementService = {
      searchUsersOnDevice: jest.fn(),
      syncUsersFromDeviceToBackend: jest.fn(),
    };
    peopleCredentialSyncService = {
      syncAllFingerprintsForSyncedUsers: jest.fn(),
      syncCards: jest.fn(),
    };
    attendanceSyncService = {
      syncLatestAttendanceWindow: jest.fn(),
      syncAttendance: jest.fn(),
    };
    accessControlSyncService = {
      syncDeviceDoors: jest.fn(),
      syncDeviceWeekPlans: jest.fn(),
      syncDeviceTemplates: jest.fn(),
      generateVirtualGroups: jest.fn(),
    };

    service = new HikvisionImportSyncService(
      queue as unknown as Queue<HikvisionSyncJobData>,
      employeeRepository as unknown as Repository<Employee>,
      assignmentRepository as unknown as Repository<EmployeeDeviceAssignment>,
      userManagementService as never,
      peopleCredentialSyncService as never,
      attendanceSyncService as never,
      accessControlSyncService as unknown as AccessControlSyncService,
    );
  });

  afterEach(() => {
    if (originalStartTime === undefined) {
      delete process.env.HIKVISION_AUTO_SYNC_START_TIME;
    } else {
      process.env.HIKVISION_AUTO_SYNC_START_TIME = originalStartTime;
    }

    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it('queues imported employee sync on the existing Hikvision queue at the configured time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-30T10:00:00.000Z'));
    process.env.TZ = 'Africa/Dar_es_Salaam';
    process.env.HIKVISION_AUTO_SYNC_START_TIME = '23:00';

    const result = await service.scheduleImportedEmployeesSync({
      companyId: 10,
      importBatchId: 'IMPORT-20260730-HIK',
      importFileName: 'employees.xlsx',
      requestedByUserId: 9,
      requestedByCompanyUserId: 33,
      employees: [
        {
          employeeId: 44,
          employeeNumber: 'EMP-044',
          providedDeviceEmployeeNumber: 'DEV-044',
        },
      ],
    });

    expect(result).toEqual({
      scheduled: true,
      scheduledFor: '2026-07-30T20:00:00.000Z',
    });
    expect(queue.add).toHaveBeenCalledWith(
      HikvisionSyncJobName.SYNC_IMPORTED_EMPLOYEES,
      expect.objectContaining({
        companyId: 10,
        deviceId: 0,
        importBatchId: 'IMPORT-20260730-HIK',
        importFileName: 'employees.xlsx',
        importedEmployees: [
          {
            employeeId: 44,
            employeeNumber: 'EMP-044',
            deviceEmployeeNumber: 'DEV-044',
          },
        ],
        scheduledFor: '2026-07-30T20:00:00.000Z',
        timeZone: 'Africa/Dar_es_Salaam',
      }),
      expect.objectContaining({
        delay: 36000000,
        jobId: 'hikvision-import-sync:10:IMPORT-20260730-HIK',
      }),
    );
  });

  it('queues import sync immediately when HIKVISION_AUTO_SYNC_START_TIME is an absolute past datetime and keeps that datetime as the attendance start bound', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-30T10:00:00.000Z'));
    process.env.TZ = 'Africa/Dar_es_Salaam';
    process.env.HIKVISION_AUTO_SYNC_START_TIME = '2026-07-01T00:00:00+03:00';

    const result = await service.scheduleImportedEmployeesSync({
      companyId: 10,
      importBatchId: 'IMPORT-20260730-HISTORY',
      importFileName: 'employees.xlsx',
      requestedByUserId: 9,
      requestedByCompanyUserId: 33,
      employees: [
        {
          employeeId: 44,
          employeeNumber: 'EMP-044',
          providedDeviceEmployeeNumber: 'DEV-044',
        },
      ],
    });

    expect(result).toEqual({
      scheduled: true,
      scheduledFor: '2026-07-30T10:00:00.000Z',
    });
    expect(queue.add).toHaveBeenCalledWith(
      HikvisionSyncJobName.SYNC_IMPORTED_EMPLOYEES,
      expect.objectContaining({
        attendanceStartTime: '2026-07-01T00:00:00+03:00',
        scheduledFor: '2026-07-30T10:00:00.000Z',
      }),
      expect.objectContaining({
        delay: 0,
      }),
    );
  });

  it('skips missing device employee numbers and reuses existing pull-sync services for matched users', async () => {
    employeeRepository.find.mockResolvedValue([
      {
        id: 1,
        employee_no: 'EMP-001',
        first_name: 'Jane',
        middle_name: null,
        last_name: 'Doe',
      },
      {
        id: 2,
        employee_no: 'EMP-002',
        first_name: 'John',
        middle_name: null,
        last_name: 'Smith',
      },
    ]);
    assignmentRepository.find.mockResolvedValue([
      {
        id: 77,
        companyId: 10,
        employeeId: 2,
        deviceId: 5,
        employeeNo: 'DEV-002',
        device: {
          id: 5,
          deviceCode: 'DEVICE-HQ-01',
          integrationType: 'hikvision',
          vendorName: 'Hikvision',
          status: AttendanceDeviceStatusEnum.ACTIVE,
          syncMode: AttendanceDeviceSyncModeEnum.PULL,
        } as AttendanceDevice,
      },
    ]);
    userManagementService.searchUsersOnDevice.mockResolvedValue({
      users: [{ employee_no: 'DEV-002' }],
    });
    userManagementService.syncUsersFromDeviceToBackend.mockResolvedValue({
      status: 'SUCCESS',
    });
    peopleCredentialSyncService.syncAllFingerprintsForSyncedUsers.mockResolvedValue(
      { status: 'SUCCESS' },
    );
    peopleCredentialSyncService.syncCards.mockResolvedValue({
      status: 'SUCCESS',
    });
    attendanceSyncService.syncLatestAttendanceWindow.mockResolvedValue({
      status: 'SUCCESS',
    });
    accessControlSyncService.syncDeviceDoors.mockResolvedValue({
      status: 'SUCCESS',
    });
    accessControlSyncService.syncDeviceWeekPlans.mockResolvedValue({
      status: 'SUCCESS',
    });
    accessControlSyncService.syncDeviceTemplates.mockResolvedValue({
      status: 'SUCCESS',
    });
    accessControlSyncService.generateVirtualGroups.mockResolvedValue({
      status: 'SUCCESS',
    });

    const result = await service.runQueuedImportedEmployeesSync({
      companyId: 10,
      deviceId: 0,
      requestedByUserId: 9,
      requestedByCompanyUserId: 33,
      requestedAt: '2026-07-30T10:00:00.000Z',
      importBatchId: 'IMPORT-20260730-HIK',
      importedEmployees: [
        {
          employeeId: 1,
          employeeNumber: 'EMP-001',
          deviceEmployeeNumber: null,
        },
        {
          employeeId: 2,
          employeeNumber: 'EMP-002',
          deviceEmployeeNumber: 'DEV-002',
        },
      ],
    });

    expect(userManagementService.searchUsersOnDevice).toHaveBeenCalledWith(
      10,
      5,
      expect.objectContaining({
        employee_nos: ['DEV-002'],
      }),
    );
    expect(
      userManagementService.syncUsersFromDeviceToBackend,
    ).toHaveBeenCalledWith(
      10,
      5,
      expect.objectContaining({
        employee_nos: ['DEV-002'],
        continue_on_error: true,
      }),
    );
    expect(accessControlSyncService.syncDeviceDoors).toHaveBeenCalledWith(
      10,
      5,
    );
    expect(accessControlSyncService.syncDeviceWeekPlans).toHaveBeenCalledWith(
      10,
      5,
    );
    expect(accessControlSyncService.syncDeviceTemplates).toHaveBeenCalledWith(
      10,
      5,
    );
    expect(accessControlSyncService.generateVirtualGroups).toHaveBeenCalledWith(
      10,
      5,
    );
    expect(
      peopleCredentialSyncService.syncAllFingerprintsForSyncedUsers,
    ).toHaveBeenCalledWith(10, 5, [
      {
        assignmentId: 0,
        employeeId: null,
        employeeNo: 'DEV-002',
      },
    ]);
    expect(peopleCredentialSyncService.syncCards).toHaveBeenCalledWith(10, 5);
    expect(
      attendanceSyncService.syncLatestAttendanceWindow,
    ).toHaveBeenCalledWith(10, 5);
    expect(result).toEqual({
      status: 'COMPLETED',
      scheduledFor: null,
      totals: {
        requestedEmployees: 2,
        employeesWithoutDeviceEmployeeNumber: 1,
        employeesWithoutAssignments: 0,
        deviceUserMismatches: 0,
        devicesProcessed: 1,
        devicesFailed: 0,
      },
    });
  });

  it('pulls attendance per matched employee from an explicit ISO start datetime and continues after one attendance failure', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-30T10:00:00.000Z'));
    employeeRepository.find.mockResolvedValue([
      {
        id: 2,
        employee_no: 'EMP-002',
        first_name: 'John',
        middle_name: null,
        last_name: 'Smith',
      },
      {
        id: 3,
        employee_no: 'EMP-003',
        first_name: 'Asha',
        middle_name: null,
        last_name: 'Mtei',
      },
    ]);
    assignmentRepository.find.mockResolvedValue([
      {
        id: 77,
        companyId: 10,
        employeeId: 2,
        deviceId: 5,
        employeeNo: 'DEV-002',
        device: {
          id: 5,
          deviceCode: 'DEVICE-HQ-01',
          integrationType: 'hikvision',
          vendorName: 'Hikvision',
          status: AttendanceDeviceStatusEnum.ACTIVE,
          syncMode: AttendanceDeviceSyncModeEnum.PULL,
        } as AttendanceDevice,
      },
      {
        id: 78,
        companyId: 10,
        employeeId: 3,
        deviceId: 5,
        employeeNo: 'DEV-003',
        device: {
          id: 5,
          deviceCode: 'DEVICE-HQ-01',
          integrationType: 'hikvision',
          vendorName: 'Hikvision',
          status: AttendanceDeviceStatusEnum.ACTIVE,
          syncMode: AttendanceDeviceSyncModeEnum.PULL,
        } as AttendanceDevice,
      },
    ]);
    userManagementService.searchUsersOnDevice.mockResolvedValue({
      users: [{ employee_no: 'DEV-002' }, { employee_no: 'DEV-003' }],
    });
    userManagementService.syncUsersFromDeviceToBackend.mockResolvedValue({
      status: 'SUCCESS',
    });
    peopleCredentialSyncService.syncAllFingerprintsForSyncedUsers.mockResolvedValue(
      { status: 'SUCCESS' },
    );
    peopleCredentialSyncService.syncCards.mockResolvedValue({
      status: 'SUCCESS',
    });
    accessControlSyncService.syncDeviceDoors.mockResolvedValue({
      status: 'SUCCESS',
    });
    accessControlSyncService.syncDeviceWeekPlans.mockResolvedValue({
      status: 'SUCCESS',
    });
    accessControlSyncService.syncDeviceTemplates.mockResolvedValue({
      status: 'SUCCESS',
    });
    accessControlSyncService.generateVirtualGroups.mockResolvedValue({
      status: 'SUCCESS',
    });
    attendanceSyncService.syncAttendance
      .mockRejectedValueOnce(new Error('device timeout for DEV-002'))
      .mockResolvedValueOnce({ status: 'SUCCESS' });

    const result = await service.runQueuedImportedEmployeesSync({
      companyId: 10,
      deviceId: 0,
      requestedByUserId: 9,
      requestedByCompanyUserId: 33,
      requestedAt: '2026-07-30T10:00:00.000Z',
      importBatchId: 'IMPORT-20260730-HISTORY',
      attendanceStartTime: '2026-07-01T00:00:00+03:00',
      importedEmployees: [
        {
          employeeId: 2,
          employeeNumber: 'EMP-002',
          deviceEmployeeNumber: 'DEV-002',
        },
        {
          employeeId: 3,
          employeeNumber: 'EMP-003',
          deviceEmployeeNumber: 'DEV-003',
        },
      ],
    });

    expect(
      attendanceSyncService.syncLatestAttendanceWindow,
    ).not.toHaveBeenCalled();
    expect(attendanceSyncService.syncAttendance).toHaveBeenNthCalledWith(
      1,
      10,
      5,
      '2026-07-01T00:00:00+03:00',
      '2026-07-30T10:00:00.000Z',
      'DEV-002',
      100,
      33,
    );
    expect(attendanceSyncService.syncAttendance).toHaveBeenNthCalledWith(
      2,
      10,
      5,
      '2026-07-01T00:00:00+03:00',
      '2026-07-30T10:00:00.000Z',
      'DEV-003',
      100,
      33,
    );
    expect(result).toEqual({
      status: 'COMPLETED',
      scheduledFor: null,
      totals: {
        requestedEmployees: 2,
        employeesWithoutDeviceEmployeeNumber: 0,
        employeesWithoutAssignments: 0,
        deviceUserMismatches: 0,
        devicesProcessed: 1,
        devicesFailed: 0,
      },
    });
  });
});
