import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AttendanceMobilePunchesService } from './attendance-mobile-punches.service';
import { AttendanceMobilePunchRepository } from './repositories/attendance-mobile-punch.repository';
import { AttendanceGeofenceRepository } from '../geofences/repositories/attendance-geofence.repository';
import { AttendanceWifiNetworkRepository } from '../wifi-networks/repositories/attendance-wifi-network.repository';
import { GeofenceDistanceService } from '../geofences/geofence-distance.service';
import { WifiNetworkValidatorService } from '../wifi-networks/validators/wifi-network-validator.service';
import { AttendancePolicy } from '../policies/entities/attendance-policy.entity';
import { AttendanceCheckpoint } from '../checkpoints/entities/attendance-checkpoint.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { AttendancePunchTypeEnum } from './enums/attendance-punch-type.enum';
import { AttendancePunchValidationStatusEnum } from './enums/attendance-punch-validation-status.enum';
import { AttendanceCheckpointTypeEnum } from '../checkpoints/enums/attendance-checkpoint-type.enum';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { AttendanceScheduleResolverService } from '../processing/attendance-schedule-resolver.service';
import { ResolvedAttendanceSchedule } from '../processing/entities/resolved-attendance-schedule.type';
import { AttendanceProcessedEvent } from '../processing/entities/attendance-processed-event.entity';
import { AttendanceDailySummary } from '../processing/entities/attendance-daily-summary.entity';
import { AttendanceProcessedEventDirectionEnum } from '../processing/enums/attendance-processed-event-direction.enum';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';

type EmployeeQueryBuilderMock = {
  innerJoin: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  getOne: jest.Mock;
};

const createEmployeeQueryBuilderMock = (): EmployeeQueryBuilderMock => ({
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
});

const buildResolvedSchedule = (
  scheduleDate: string,
  overrides: Partial<ResolvedAttendanceSchedule> = {},
): ResolvedAttendanceSchedule => ({
  employeeId: 39,
  scheduleDate,
  source: 'SHIFT_SCHEDULE',
  timezone: 'Africa/Dar_es_Salaam',
  shiftId: 10,
  timetableId: null,
  branchId: 5,
  isOffDay: false,
  isHoliday: false,
  holidayId: null,
  scheduleStartAt: new Date(`${scheduleDate}T08:15:00.000Z`),
  scheduleEndAt: new Date(`${scheduleDate}T17:15:00.000Z`),
  lateAfterMinutes: 0,
  halfDayAfterMinutes: 0,
  absentAfterMinutes: 0,
  graceInMinutes: 0,
  graceOutMinutes: 0,
  earlyLeaveAfterMinutes: 0,
  allowEarlyCheckin: true,
  allowLateCheckout: true,
  autoAbsentIfNoCheckin: true,
  allowOvertime: true,
  overtimeStartAfterMinutes: 0,
  maxOvertimeMinutes: 0,
  requiresCheckout: true,
  ignoreMissingCheckoutIfHoursValid: false,
  ...overrides,
});

describe('AttendanceMobilePunchesService', () => {
  let service: AttendanceMobilePunchesService;
  let punchRepo: {
    createEntity: jest.Mock;
    save: jest.Mock;
    findApprovedForEmployeeWindow: jest.Mock;
  };
  let geofenceRepo: {
    findActiveByIds: jest.Mock;
    findActiveForBranch: jest.Mock;
  };
  let wifiRepo: {
    findActiveByIds: jest.Mock;
    findActiveForBranch: jest.Mock;
  };
  let geofenceDistanceService: {
    validateCircleGeofence: jest.Mock;
  };
  let wifiValidator: {
    validate: jest.Mock;
  };
  let policyRepository: {
    findOne: jest.Mock;
  };
  let checkpointRepository: {
    find: jest.Mock;
  };
  let employeeRepository: {
    createQueryBuilder: jest.Mock;
  };
  let scheduleResolver: {
    resolveForDate: jest.Mock;
  };
  let processedEventRepository: {
    find: jest.Mock;
  };
  let dailySummaryRepository: {
    findOne: jest.Mock;
  };
  let rawLogRepository: {
    find: jest.Mock;
  };
  let employeeQueryBuilder: EmployeeQueryBuilderMock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-18T09:30:00.000Z'));

    punchRepo = {
      createEntity: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      findApprovedForEmployeeWindow: jest.fn().mockResolvedValue([]),
    };
    geofenceRepo = {
      findActiveByIds: jest.fn(),
      findActiveForBranch: jest.fn(),
    };
    wifiRepo = {
      findActiveByIds: jest.fn(),
      findActiveForBranch: jest.fn(),
    };
    geofenceDistanceService = {
      validateCircleGeofence: jest.fn(),
    };
    wifiValidator = {
      validate: jest.fn(),
    };
    policyRepository = {
      findOne: jest.fn(),
    };
    checkpointRepository = {
      find: jest.fn(),
    };
    scheduleResolver = {
      resolveForDate: jest.fn((companyId: number, employeeId: number, date: string) =>
        Promise.resolve(
          buildResolvedSchedule(date, {
            employeeId,
          }),
        ),
      ),
    };
    processedEventRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    dailySummaryRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    rawLogRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    employeeQueryBuilder = createEmployeeQueryBuilderMock();
    employeeRepository = {
      createQueryBuilder: jest.fn(() => employeeQueryBuilder),
    };

    service = new AttendanceMobilePunchesService(
      punchRepo as unknown as AttendanceMobilePunchRepository,
      geofenceRepo as unknown as AttendanceGeofenceRepository,
      wifiRepo as unknown as AttendanceWifiNetworkRepository,
      geofenceDistanceService as unknown as GeofenceDistanceService,
      wifiValidator as unknown as WifiNetworkValidatorService,
      scheduleResolver as unknown as AttendanceScheduleResolverService,
      policyRepository as unknown as Repository<AttendancePolicy>,
      checkpointRepository as unknown as Repository<AttendanceCheckpoint>,
      employeeRepository as unknown as Repository<Employee>,
      processedEventRepository as unknown as Repository<AttendanceProcessedEvent>,
      dailySummaryRepository as unknown as Repository<AttendanceDailySummary>,
      rawLogRepository as unknown as Repository<HikvisionAttendanceLog>,
    );

    employeeQueryBuilder.getOne.mockResolvedValue({
      id: 39,
      employee_no: 'EMP-039',
      primary_branch_id: 5,
      employment_status: EmploymentStatusEnum.ACTIVE,
      exit_date: null,
    });
    policyRepository.findOne.mockResolvedValue({
      id: 12,
      company_id: 1,
      is_active: true,
      authentication_modes: 'MOBILE_APP,WEB',
      require_geo_fencing: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('matches and stores allowed geofence and WiFi network on check-in', async () => {
    checkpointRepository.find.mockResolvedValue([
      {
        id: 101,
        type: AttendanceCheckpointTypeEnum.GPS,
        geofenceId: 7,
        maxDistanceMeters: 30,
        status: 'ACTIVE',
        isRequired: true,
      },
      {
        id: 102,
        type: AttendanceCheckpointTypeEnum.WIFI,
        wifiNetworkId: 9,
        status: 'ACTIVE',
        isRequired: true,
      },
    ]);
    geofenceRepo.findActiveByIds.mockResolvedValue([
      {
        id: 7,
        name: 'HQ Reception',
        branchId: 5,
        status: 'ACTIVE',
        type: 'CIRCLE',
        latitude: '-6.7923540',
        longitude: '39.2083280',
        radiusMeters: 100,
        allowedAccuracyMeters: 50,
        strictAccuracy: false,
      },
    ]);
    wifiRepo.findActiveByIds.mockResolvedValue([
      {
        id: 9,
        name: 'Alliance-HQ-Staff',
        branchId: 5,
      },
    ]);
    geofenceDistanceService.validateCircleGeofence.mockReturnValue({
      valid: true,
      distanceMeters: 12,
      message: 'Location is inside the allowed geofence.',
    });
    wifiValidator.validate.mockReturnValue({
      valid: true,
      message: 'WiFi network validation passed.',
    });

    const result = await service.checkIn({
      companyId: 1,
      authenticatedEmployeeId: 39,
      employeeId: 39,
      dto: {
        latitude: -6.792354,
        longitude: 39.208328,
        accuracyMeters: 8.5,
        wifiSsid: 'Alliance-HQ-Staff',
        wifiBssid: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '10.40.1.24',
        deviceIdentifier: 'android-SM-A546E-8f3b21c9',
      },
      requestIp: '10.40.1.24',
      userAgent: 'jest',
    });

    expect(result.message).toBe('Attendance punch saved successfully.');
    expect(punchRepo.createEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 39,
        geofenceId: 7,
        wifiNetworkId: 9,
        punchType: AttendancePunchTypeEnum.CHECK_IN,
        validationStatus: AttendancePunchValidationStatusEnum.APPROVED,
      }),
    );
    expect(result.punch).toEqual(
      expect.objectContaining({
        geofenceId: 7,
        wifiNetworkId: 9,
        punchType: AttendancePunchTypeEnum.CHECK_IN,
      }),
    );
  });

  it('uses the same backend matching flow on check-out', async () => {
    checkpointRepository.find.mockResolvedValue([
      {
        id: 201,
        type: AttendanceCheckpointTypeEnum.GPS,
        geofenceId: 17,
        maxDistanceMeters: null,
        status: 'ACTIVE',
        isRequired: true,
      },
    ]);
    geofenceRepo.findActiveByIds.mockResolvedValue([
      {
        id: 17,
        name: 'HQ Exit',
        branchId: 5,
        status: 'ACTIVE',
        type: 'CIRCLE',
        latitude: '-6.7924010',
        longitude: '39.2082950',
        radiusMeters: 100,
        allowedAccuracyMeters: 50,
        strictAccuracy: false,
      },
    ]);
    wifiRepo.findActiveForBranch.mockResolvedValue([]);
    geofenceDistanceService.validateCircleGeofence.mockReturnValue({
      valid: true,
      distanceMeters: 4,
      message: 'Location is inside the allowed geofence.',
    });
    processedEventRepository.find.mockResolvedValue([
      {
        direction: AttendanceProcessedEventDirectionEnum.IN,
        eventTime: new Date('2026-06-18T08:22:00.000Z'),
      },
    ]);

    const result = await service.checkOut({
      companyId: 1,
      authenticatedEmployeeId: 39,
      employeeId: 39,
      dto: {
        latitude: -6.792401,
        longitude: 39.208295,
        accuracyMeters: 7.2,
      },
      requestIp: '10.40.1.24',
      userAgent: 'jest',
    });

    expect(punchRepo.createEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        geofenceId: 17,
        wifiNetworkId: null,
        punchType: AttendancePunchTypeEnum.CHECK_OUT,
      }),
    );
    expect(result.punch).toEqual(
      expect.objectContaining({
        punchType: AttendancePunchTypeEnum.CHECK_OUT,
        geofenceId: 17,
      }),
    );
  });

  it('blocks duplicate mobile check-ins for the same resolved attendance day', async () => {
    checkpointRepository.find.mockResolvedValue([]);
    geofenceRepo.findActiveForBranch.mockResolvedValue([
      {
        id: 27,
        name: 'HQ Campus',
        branchId: 5,
        status: 'ACTIVE',
        type: 'CIRCLE',
        latitude: '-6.7923540',
        longitude: '39.2083280',
        radiusMeters: 100,
        allowedAccuracyMeters: 50,
        strictAccuracy: false,
      },
    ]);
    wifiRepo.findActiveForBranch.mockResolvedValue([]);
    geofenceDistanceService.validateCircleGeofence.mockReturnValue({
      valid: true,
      distanceMeters: 6,
      message: 'Location is inside the allowed geofence.',
    });
    punchRepo.findApprovedForEmployeeWindow.mockResolvedValue([
      {
        punchType: AttendancePunchTypeEnum.CHECK_IN,
        validationStatus: AttendancePunchValidationStatusEnum.APPROVED,
      },
    ]);

    await expect(
      service.checkIn({
        companyId: 1,
        authenticatedEmployeeId: 39,
        employeeId: 39,
        dto: {
          latitude: -6.792354,
          longitude: 39.208328,
          accuracyMeters: 8.5,
        },
        requestIp: '10.40.1.24',
        userAgent: 'jest',
      }),
    ).rejects.toMatchObject({
      response: {
        message: 'Employee has already checked in for this attendance day.',
      },
    });

    expect(punchRepo.save).not.toHaveBeenCalled();
  });

  it('blocks mobile check-out when a biometric/device check-out already exists', async () => {
    checkpointRepository.find.mockResolvedValue([]);
    geofenceRepo.findActiveForBranch.mockResolvedValue([
      {
        id: 61,
        name: 'HQ Campus',
        branchId: 5,
        status: 'ACTIVE',
        type: 'CIRCLE',
        latitude: '-6.7923540',
        longitude: '39.2083280',
        radiusMeters: 100,
        allowedAccuracyMeters: 50,
        strictAccuracy: false,
      },
    ]);
    wifiRepo.findActiveForBranch.mockResolvedValue([]);
    geofenceDistanceService.validateCircleGeofence.mockReturnValue({
      valid: true,
      distanceMeters: 5,
      message: 'Location is inside the allowed geofence.',
    });
    processedEventRepository.find.mockResolvedValue([
      {
        direction: AttendanceProcessedEventDirectionEnum.IN,
        eventTime: new Date('2026-06-18T08:10:00.000Z'),
      },
      {
        direction: AttendanceProcessedEventDirectionEnum.OUT,
        eventTime: new Date('2026-06-18T17:05:00.000Z'),
      },
    ]);

    await expect(
      service.checkOut({
        companyId: 1,
        authenticatedEmployeeId: 39,
        employeeId: 39,
        dto: {
          latitude: -6.792354,
          longitude: 39.208328,
          accuracyMeters: 8.5,
        },
        requestIp: '10.40.1.24',
        userAgent: 'jest',
      }),
    ).rejects.toMatchObject({
      response: {
        message: 'Employee has already checked out for this attendance day.',
      },
    });

    expect(punchRepo.save).not.toHaveBeenCalled();
  });

  it('blocks mobile check-in when an unprocessed biometric raw log already exists', async () => {
    checkpointRepository.find.mockResolvedValue([]);
    geofenceRepo.findActiveForBranch.mockResolvedValue([
      {
        id: 72,
        name: 'HQ Campus',
        branchId: 5,
        status: 'ACTIVE',
        type: 'CIRCLE',
        latitude: '-6.7923540',
        longitude: '39.2083280',
        radiusMeters: 100,
        allowedAccuracyMeters: 50,
        strictAccuracy: false,
      },
    ]);
    wifiRepo.findActiveForBranch.mockResolvedValue([]);
    geofenceDistanceService.validateCircleGeofence.mockReturnValue({
      valid: true,
      distanceMeters: 3,
      message: 'Location is inside the allowed geofence.',
    });
    rawLogRepository.find.mockResolvedValue([
      {
        employeeNo: 'EMP-039',
        eventTime: new Date('2026-06-18T08:02:00.000Z'),
        minor: 1,
        attendanceStatus: null,
      },
    ]);

    await expect(
      service.checkIn({
        companyId: 1,
        authenticatedEmployeeId: 39,
        employeeId: 39,
        dto: {
          latitude: -6.792354,
          longitude: 39.208328,
          accuracyMeters: 8.5,
        },
        requestIp: '10.40.1.24',
        userAgent: 'jest',
      }),
    ).rejects.toMatchObject({
      response: {
        message: 'Employee has already checked in for this attendance day.',
      },
    });

    expect(punchRepo.save).not.toHaveBeenCalled();
  });

  it('requires an existing check-in before allowing check-out', async () => {
    checkpointRepository.find.mockResolvedValue([]);
    geofenceRepo.findActiveForBranch.mockResolvedValue([
      {
        id: 73,
        name: 'HQ Campus',
        branchId: 5,
        status: 'ACTIVE',
        type: 'CIRCLE',
        latitude: '-6.7923540',
        longitude: '39.2083280',
        radiusMeters: 100,
        allowedAccuracyMeters: 50,
        strictAccuracy: false,
      },
    ]);
    wifiRepo.findActiveForBranch.mockResolvedValue([]);
    geofenceDistanceService.validateCircleGeofence.mockReturnValue({
      valid: true,
      distanceMeters: 3,
      message: 'Location is inside the allowed geofence.',
    });

    await expect(
      service.checkOut({
        companyId: 1,
        authenticatedEmployeeId: 39,
        employeeId: 39,
        dto: {
          latitude: -6.792354,
          longitude: 39.208328,
          accuracyMeters: 8.5,
        },
        requestIp: '10.40.1.24',
        userAgent: 'jest',
      }),
    ).rejects.toMatchObject({
      response: {
        message: 'Employee must check in before checking out.',
      },
    });
  });

  it('uses the resolved overnight attendance date instead of the calendar date', async () => {
    jest.setSystemTime(new Date('2026-06-19T04:30:00.000Z'));
    checkpointRepository.find.mockResolvedValue([]);
    geofenceRepo.findActiveForBranch.mockResolvedValue([
      {
        id: 74,
        name: 'Night Shift Gate',
        branchId: 5,
        status: 'ACTIVE',
        type: 'CIRCLE',
        latitude: '-6.7923540',
        longitude: '39.2083280',
        radiusMeters: 100,
        allowedAccuracyMeters: 50,
        strictAccuracy: false,
      },
    ]);
    wifiRepo.findActiveForBranch.mockResolvedValue([]);
    geofenceDistanceService.validateCircleGeofence.mockReturnValue({
      valid: true,
      distanceMeters: 2,
      message: 'Location is inside the allowed geofence.',
    });
    scheduleResolver.resolveForDate.mockImplementation(
      (companyId: number, employeeId: number, date: string) => {
        if (date === '2026-06-18') {
          return Promise.resolve(
            buildResolvedSchedule(date, {
              employeeId,
              scheduleStartAt: new Date('2026-06-18T22:00:00.000Z'),
              scheduleEndAt: new Date('2026-06-19T06:00:00.000Z'),
            }),
          );
        }

        return Promise.resolve(
          buildResolvedSchedule(date, {
            employeeId,
          }),
        );
      },
    );
    processedEventRepository.find.mockResolvedValue([
      {
        direction: AttendanceProcessedEventDirectionEnum.IN,
        eventTime: new Date('2026-06-18T22:05:00.000Z'),
      },
    ]);

    const result = await service.checkOut({
      companyId: 1,
      authenticatedEmployeeId: 39,
      employeeId: 39,
      dto: {
        latitude: -6.792354,
        longitude: 39.208328,
        accuracyMeters: 8.5,
      },
      requestIp: '10.40.1.24',
      userAgent: 'jest',
    });

    expect(result.punch).toEqual(
      expect.objectContaining({
        attendanceDate: '2026-06-18',
        punchType: AttendancePunchTypeEnum.CHECK_OUT,
      }),
    );
  });

  it('rejects the request when no valid timetable or shift can be resolved', async () => {
    checkpointRepository.find.mockResolvedValue([]);
    geofenceRepo.findActiveForBranch.mockResolvedValue([
      {
        id: 75,
        name: 'HQ Campus',
        branchId: 5,
        status: 'ACTIVE',
        type: 'CIRCLE',
        latitude: '-6.7923540',
        longitude: '39.2083280',
        radiusMeters: 100,
        allowedAccuracyMeters: 50,
        strictAccuracy: false,
      },
    ]);
    wifiRepo.findActiveForBranch.mockResolvedValue([]);
    geofenceDistanceService.validateCircleGeofence.mockReturnValue({
      valid: true,
      distanceMeters: 2,
      message: 'Location is inside the allowed geofence.',
    });
    scheduleResolver.resolveForDate.mockImplementation(
      (companyId: number, employeeId: number, date: string) =>
        Promise.resolve(
          buildResolvedSchedule(date, {
            employeeId,
            source: 'NONE',
            shiftId: null,
            scheduleStartAt: null,
            scheduleEndAt: null,
          }),
        ),
    );

    await expect(
      service.checkIn({
        companyId: 1,
        authenticatedEmployeeId: 39,
        employeeId: 39,
        dto: {
          latitude: -6.792354,
          longitude: 39.208328,
          accuracyMeters: 8.5,
        },
        requestIp: '10.40.1.24',
        userAgent: 'jest',
      }),
    ).rejects.toMatchObject({
      response: {
        message:
          'No valid timetable or shift found for this employee on this attendance day.',
      },
    });

    expect(punchRepo.save).not.toHaveBeenCalled();
  });

  it('requires coordinates to match a registered system geofence even without GPS checkpoints', async () => {
    checkpointRepository.find.mockResolvedValue([]);
    geofenceRepo.findActiveForBranch.mockResolvedValue([
      {
        id: 27,
        name: 'HQ Campus',
        branchId: 5,
        status: 'ACTIVE',
        type: 'CIRCLE',
        latitude: '-6.7923540',
        longitude: '39.2083280',
        radiusMeters: 100,
        allowedAccuracyMeters: 50,
        strictAccuracy: false,
      },
    ]);
    wifiRepo.findActiveForBranch.mockResolvedValue([]);
    geofenceDistanceService.validateCircleGeofence.mockReturnValue({
      valid: true,
      distanceMeters: 6,
      message: 'Location is inside the allowed geofence.',
    });

    const result = await service.checkIn({
      companyId: 1,
      authenticatedEmployeeId: 39,
      employeeId: 39,
      dto: {
        latitude: -6.792354,
        longitude: 39.208328,
        accuracyMeters: 8.5,
      },
      requestIp: '10.40.1.24',
      userAgent: 'jest',
    });

    expect(geofenceRepo.findActiveForBranch).toHaveBeenCalledWith(1, 5);
    expect(result.punch).toEqual(
      expect.objectContaining({
        geofenceId: 27,
        validationStatus: AttendancePunchValidationStatusEnum.APPROVED,
      }),
    );
  });

  it('rejects the request when the location does not match any allowed geofence', async () => {
    checkpointRepository.find.mockResolvedValue([
      {
        id: 301,
        type: AttendanceCheckpointTypeEnum.GPS,
        geofenceId: 70,
        maxDistanceMeters: 20,
        status: 'ACTIVE',
        isRequired: true,
      },
    ]);
    geofenceRepo.findActiveByIds.mockResolvedValue([
      {
        id: 70,
        name: 'HQ Main',
        branchId: 5,
        status: 'ACTIVE',
        type: 'CIRCLE',
        latitude: '-6.7923540',
        longitude: '39.2083280',
        radiusMeters: 50,
        allowedAccuracyMeters: 10,
        strictAccuracy: false,
      },
    ]);
    wifiRepo.findActiveForBranch.mockResolvedValue([]);
    geofenceDistanceService.validateCircleGeofence.mockReturnValue({
      valid: false,
      distanceMeters: 140,
      message: 'Location is outside the allowed geofence. Distance 140m, allowed 60m.',
    });

    let thrown: BadRequestException | null = null;

    try {
      await service.checkIn({
        companyId: 1,
        authenticatedEmployeeId: 39,
        employeeId: 39,
        dto: {
          latitude: -6.791,
          longitude: 39.21,
          accuracyMeters: 5,
          overrideReason: 'New check in',
        },
        requestIp: '10.40.1.24',
        userAgent: 'jest',
      });
    } catch (error) {
      thrown = error as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(thrown?.getResponse()).toEqual(
      expect.objectContaining({
        message: 'Location is not inside the allowed geofence.',
      }),
    );
    expect(punchRepo.createEntity).not.toHaveBeenCalled();
    expect(punchRepo.save).not.toHaveBeenCalled();
  });

  it('rejects provided WiFi details when they do not match an allowed office network', async () => {
    checkpointRepository.find.mockResolvedValue([]);
    geofenceRepo.findActiveForBranch.mockResolvedValue([
      {
        id: 55,
        name: 'HQ Campus',
        branchId: 5,
        status: 'ACTIVE',
        type: 'CIRCLE',
        latitude: '-6.7923540',
        longitude: '39.2083280',
        radiusMeters: 100,
        allowedAccuracyMeters: 50,
        strictAccuracy: false,
      },
    ]);
    wifiRepo.findActiveForBranch.mockResolvedValue([
      {
        id: 44,
        name: 'Alliance-HQ-Staff',
        branchId: 5,
      },
    ]);
    geofenceDistanceService.validateCircleGeofence.mockReturnValue({
      valid: true,
      distanceMeters: 5,
      message: 'Location is inside the allowed geofence.',
    });
    wifiValidator.validate.mockReturnValue({
      valid: false,
      message: 'Invalid WiFi SSID. Required Alliance-HQ-Staff, received Guest-WiFi.',
    });

    let thrown: BadRequestException | null = null;

    try {
      await service.checkIn({
        companyId: 1,
        authenticatedEmployeeId: 39,
        employeeId: 39,
        dto: {
          latitude: -6.792354,
          longitude: 39.208328,
          wifiSsid: 'Guest-WiFi',
          wifiBssid: 'AA:BB:CC:DD:EE:FF',
          ipAddress: '10.40.1.24',
          overrideReason: 'New check in',
        },
        requestIp: '10.40.1.24',
        userAgent: 'jest',
      });
    } catch (error) {
      thrown = error as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(thrown?.getResponse()).toEqual(
      expect.objectContaining({
        message: 'WiFi network does not match any allowed office network.',
      }),
    );
    expect(punchRepo.createEntity).not.toHaveBeenCalled();
    expect(punchRepo.save).not.toHaveBeenCalled();
  });

  it('still supports pending override for non-geofence and non-wifi validation failures', async () => {
    checkpointRepository.find.mockResolvedValue([
      {
        id: 401,
        type: AttendanceCheckpointTypeEnum.QR,
        status: 'ACTIVE',
        isRequired: true,
      },
    ]);
    geofenceRepo.findActiveForBranch.mockResolvedValue([
      {
        id: 88,
        name: 'HQ Campus',
        branchId: 5,
        status: 'ACTIVE',
        type: 'CIRCLE',
        latitude: '-6.7923540',
        longitude: '39.2083280',
        radiusMeters: 100,
        allowedAccuracyMeters: 50,
        strictAccuracy: false,
      },
    ]);
    wifiRepo.findActiveForBranch.mockResolvedValue([]);
    geofenceDistanceService.validateCircleGeofence.mockReturnValue({
      valid: true,
      distanceMeters: 4,
      message: 'Location is inside the allowed geofence.',
    });

    const result = await service.checkIn({
      companyId: 1,
      authenticatedEmployeeId: 39,
      employeeId: 39,
      dto: {
        latitude: -6.792354,
        longitude: 39.208328,
        overrideReason: 'Need manager review',
      },
      requestIp: '10.40.1.24',
      userAgent: 'jest',
    });

    expect(result.message).toBe('Attendance punch saved as pending override.');
    expect(punchRepo.createEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        geofenceId: 88,
        validationStatus: AttendancePunchValidationStatusEnum.PENDING_OVERRIDE,
        isOverrideRequested: true,
        overrideReason: 'Need manager review',
      }),
    );
  });
});
