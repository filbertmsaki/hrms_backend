import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AttendanceMobilePunchesService } from './attendance-mobile-punches.service';
import { AttendanceMobilePunchRepository } from './repositories/attendance-mobile-punch.repository';
import { AttendanceGeofenceRepository } from '../geofences/repositories/attendance-geofence.repository';
import { AttendanceWifiNetworkRepository } from '../wifi-networks/repositories/attendance-wifi-network.repository';
import { GeofenceDistanceService } from '../geofences/geofence-distance.service';
import { WifiNetworkValidatorService } from '../wifi-networks/validators/wifi-network-validator.service';
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
import { AttendanceEventIngestionService } from '../processing/attendance-event-ingestion.service';
import { AttendanceProcessedEventDirectionEnum } from '../processing/enums/attendance-processed-event-direction.enum';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceCompanyConfigService } from '../shared/attendance-company-config.service';
import { AttendanceRoundingModeEnum } from '../policies/enums/attendance-rounding-mode.enum';
import { AttendanceHolidayPolicyModeEnum } from '../policies/enums/attendance-holiday-policy-mode.enum';
import { AttendanceMobileDeviceRegistration } from './entities/attendance-mobile-device-registration.entity';

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
  allowRemoteAttendance: false,
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
  overtimeRequiresApproval: false,
  requiresCheckout: true,
  ignoreMissingCheckoutIfHoursValid: false,
  roundingMode: AttendanceRoundingModeEnum.NEAREST,
  maxMissingPunchAllowed: 0,
  holidayPolicyMode: AttendanceHolidayPolicyModeEnum.OFF,
  ...overrides,
});

describe('AttendanceMobilePunchesService', () => {
  let service: AttendanceMobilePunchesService;
  let punchRepo: {
    createEntity: jest.Mock;
    save: jest.Mock;
    findApprovedForEmployeeWindow: jest.Mock;
    findByClientRequest: jest.Mock;
    findOneById: jest.Mock;
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
  let attendanceCompanyConfigService: {
    resolvePolicyForCompany: jest.Mock;
  };
  let eventIngestionService: {
    ingestMobilePunch: jest.Mock;
  };
  let configService: { get: jest.Mock };
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
  let workFromHomeService: {
    assertApprovedForDate: jest.Mock;
  };
  let employeeQueryBuilder: EmployeeQueryBuilderMock;
  let savedPunch: Record<string, unknown> | null;
  let nextPunchId: number;
  let retentionLock: { runWithLock: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-18T09:30:00.000Z'));
    savedPunch = null;
    nextPunchId = 1000;

    punchRepo = {
      createEntity: jest.fn((value: unknown) => value),
      save: jest.fn((value: Record<string, unknown>) => {
        savedPunch = {
          id: value.id ?? nextPunchId++,
          ...value,
        };

        return Promise.resolve(savedPunch);
      }),
      findApprovedForEmployeeWindow: jest.fn().mockResolvedValue([]),
      findByClientRequest: jest.fn().mockResolvedValue(null),
      findOneById: jest
        .fn()
        .mockImplementation(async (companyId: number, id: number) =>
          savedPunch &&
          savedPunch.companyId === companyId &&
          savedPunch.id === id
            ? savedPunch
            : null,
        ),
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
    attendanceCompanyConfigService = {
      resolvePolicyForCompany: jest.fn(),
    };
    eventIngestionService = {
      ingestMobilePunch: jest.fn().mockResolvedValue(undefined),
    };
    configService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'ATTENDANCE_MOBILE_REQUIRE_DEVICE_IDENTIFIER':
            return true;
          case 'ATTENDANCE_MOBILE_MAX_CLOCK_SKEW_SECONDS':
            return 300;
          case 'ATTENDANCE_SELFIE_RETENTION_DAYS':
            return 30;
          case 'ATTENDANCE_SELFIE_RETENTION_PURGE_ENABLED':
            return false;
          default:
            return undefined;
        }
      }),
    };
    checkpointRepository = {
      find: jest.fn(),
    };
    scheduleResolver = {
      resolveForDate: jest.fn(
        (companyId: number, employeeId: number, date: string) =>
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
    workFromHomeService = {
      assertApprovedForDate: jest.fn().mockResolvedValue(undefined),
    };
    retentionLock = {
      runWithLock: jest.fn(async (_key, callback) => ({
        acquired: true,
        result: await callback(),
      })),
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
      attendanceCompanyConfigService as unknown as AttendanceCompanyConfigService,
      eventIngestionService as unknown as AttendanceEventIngestionService,
      configService as unknown as ConfigService,
      checkpointRepository as unknown as Repository<AttendanceCheckpoint>,
      employeeRepository as unknown as Repository<Employee>,
      processedEventRepository as unknown as Repository<AttendanceProcessedEvent>,
      dailySummaryRepository as unknown as Repository<AttendanceDailySummary>,
      rawLogRepository as unknown as Repository<HikvisionAttendanceLog>,
      workFromHomeService as never,
      undefined,
      undefined,
      retentionLock as never,
    );

    employeeQueryBuilder.getOne.mockResolvedValue({
      id: 39,
      employee_no: 'EMP-039',
      primary_branch_id: 5,
      employment_status: EmploymentStatusEnum.ACTIVE,
      exit_date: null,
    });
    attendanceCompanyConfigService.resolvePolicyForCompany.mockResolvedValue({
      id: 12,
      company_id: 1,
      is_active: true,
      authentication_modes: 'MOBILE_APP,WEB',
      require_geo_fencing: false,
      allow_multi_device_login: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts selfie retention candidates without purging in dry-run mode', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    (
      punchRepo as typeof punchRepo & { getNativeRepository: jest.Mock }
    ).getNativeRepository = jest.fn(() => ({
      createQueryBuilder: jest.fn(() => queryBuilder),
    }));

    await service.runSelfieRetention();

    expect(retentionLock.runWithLock).not.toHaveBeenCalled();
    expect(queryBuilder.getCount).toHaveBeenCalledTimes(1);
  });

  it('releases a registered mobile device with an append-only audit record', async () => {
    const registration = {
      id: 4,
      companyId: 1,
      employeeId: 39,
      lastEmployeeId: null,
      deviceIdentifier: 'android:device-4',
      deviceInfo: { platform: 'android' },
      status: 'ACTIVE',
      releasedByCompanyUserId: null,
      releasedAt: null,
      releaseReason: null,
    };
    const registrationRepository = {
      findOne: jest.fn().mockResolvedValue(registration),
      save: jest.fn(async (entity) => entity),
      create: jest.fn((entity) => entity),
    };
    const auditRepository = {
      save: jest.fn(async (entity) => entity),
      create: jest.fn((entity) => entity),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === AttendanceMobileDeviceRegistration
          ? registrationRepository
          : auditRepository,
      ),
    };
    const deviceRegistrationRepository = {
      manager: {
        transaction: jest.fn((callback) => callback(manager)),
      },
    };
    (
      service as unknown as { deviceRegistrationRepository: unknown }
    ).deviceRegistrationRepository = deviceRegistrationRepository;

    await expect(
      service.releaseMobileDeviceRegistration({
        companyId: 1,
        id: 4,
        releasedByCompanyUserId: 55,
        dto: { reason: 'Employee replaced phone' },
      }),
    ).resolves.toMatchObject({
      status: 'UNBOUND',
      employee_id: null,
      last_employee_id: 39,
      release_reason: 'Employee replaced phone',
    });
    expect(registrationRepository.findOne).toHaveBeenCalledWith({
      where: { companyId: 1, id: 4 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(auditRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RELEASED',
        previousEmployeeId: 39,
        employeeId: null,
        actorCompanyUserId: 55,
        reason: 'Employee replaced phone',
      }),
    );
  });

  it('rejects remote attendance when the resolved shift does not allow it', async () => {
    checkpointRepository.find.mockResolvedValue([]);
    wifiRepo.findActiveForBranch.mockResolvedValue([]);

    await expect(
      service.checkIn({
        companyId: 1,
        authenticatedEmployeeId: 39,
        employeeId: 39,
        dto: {
          clientRequestId: '00000000-0000-4000-8000-000000000071',
          latitude: -6.792354,
          longitude: 39.208328,
          deviceIdentifier: 'android-device',
          remoteAttendance: true,
        },
      }),
    ).rejects.toMatchObject({
      response: {
        message: 'The assigned shift does not allow remote attendance.',
      },
    });

    expect(punchRepo.save).not.toHaveBeenCalled();
  });

  it('records remote attendance when the resolved shift allows it', async () => {
    scheduleResolver.resolveForDate.mockImplementation(
      (companyId: number, employeeId: number, date: string) =>
        Promise.resolve(
          buildResolvedSchedule(date, {
            employeeId,
            allowRemoteAttendance: true,
          }),
        ),
    );
    checkpointRepository.find.mockResolvedValue([]);
    wifiRepo.findActiveForBranch.mockResolvedValue([]);

    const result = await service.checkIn({
      companyId: 1,
      authenticatedEmployeeId: 39,
      employeeId: 39,
      dto: {
        clientRequestId: '00000000-0000-4000-8000-000000000072',
        latitude: -6.792354,
        longitude: 39.208328,
        deviceIdentifier: 'android-device',
        remoteAttendance: true,
      },
    });

    expect(result.punch).toEqual(
      expect.objectContaining({
        rawPayload: expect.objectContaining({ remoteAttendance: true }),
      }),
    );
    expect(workFromHomeService.assertApprovedForDate).toHaveBeenCalledWith(
      1,
      39,
      expect.any(String),
    );
  });

  it('rejects remote attendance without an approved work-from-home request', async () => {
    scheduleResolver.resolveForDate.mockImplementation(
      (companyId: number, employeeId: number, date: string) =>
        Promise.resolve(
          buildResolvedSchedule(date, {
            employeeId,
            allowRemoteAttendance: true,
          }),
        ),
    );
    workFromHomeService.assertApprovedForDate.mockRejectedValue(
      new ForbiddenException(
        'An approved work-from-home request is required for 2026-06-18.',
      ),
    );

    await expect(
      service.checkIn({
        companyId: 1,
        authenticatedEmployeeId: 39,
        employeeId: 39,
        dto: {
          clientRequestId: '00000000-0000-4000-8000-000000000073',
          latitude: -6.792354,
          longitude: 39.208328,
          deviceIdentifier: 'android-device',
          remoteAttendance: true,
        },
      }),
    ).rejects.toThrow('An approved work-from-home request is required');
    expect(punchRepo.save).not.toHaveBeenCalled();
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
        clientRequestId: '00000000-0000-4000-8000-000000000001',
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

    expect(result.message).toBe(
      'Attendance punch saved and processed successfully.',
    );
    expect(result.idempotent_replay).toBe(false);
    expect(eventIngestionService.ingestMobilePunch).toHaveBeenCalledWith(
      1,
      1000,
    );
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

  it('requires and records successful validation for a QR checkpoint', async () => {
    const qrValidationResult = {
      required: true,
      valid: true,
      checkpointId: 88,
    };
    const qrService = {
      validateAndConsume: jest.fn().mockResolvedValue(qrValidationResult),
    };
    (
      service as unknown as { checkpointQrService: typeof qrService }
    ).checkpointQrService = qrService;
    checkpointRepository.find.mockResolvedValue([
      {
        id: 88,
        policySetId: 12,
        type: AttendanceCheckpointTypeEnum.QR,
        status: 'ACTIVE',
        isRequired: true,
      },
    ]);
    wifiRepo.findActiveForBranch.mockResolvedValue([]);

    const result = await service.checkIn({
      companyId: 1,
      authenticatedEmployeeId: 39,
      employeeId: 39,
      dto: {
        clientRequestId: '00000000-0000-4000-8000-000000000088',
        latitude: -6.792354,
        longitude: 39.208328,
        deviceIdentifier: 'android-SM-A546E-8f3b21c9',
        qrToken: 'signed-checkpoint-token',
      },
    });

    expect(qrService.validateAndConsume).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 1,
        employeeId: 39,
        policySetId: 12,
        token: 'signed-checkpoint-token',
      }),
    );
    expect(punchRepo.createEntity).toHaveBeenCalledWith(
      expect.objectContaining({ qrValidationResult }),
    );
    expect(result.idempotent_replay).toBe(false);
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
        clientRequestId: '00000000-0000-4000-8000-000000000002',
        latitude: -6.792401,
        longitude: 39.208295,
        accuracyMeters: 7.2,
        deviceIdentifier: 'android-SM-A546E-8f3b21c9',
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
          clientRequestId: '00000000-0000-4000-8000-000000000003',
          latitude: -6.792354,
          longitude: 39.208328,
          accuracyMeters: 8.5,
          deviceIdentifier: 'android-SM-A546E-8f3b21c9',
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
          clientRequestId: '00000000-0000-4000-8000-000000000004',
          latitude: -6.792354,
          longitude: 39.208328,
          accuracyMeters: 8.5,
          deviceIdentifier: 'android-SM-A546E-8f3b21c9',
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
          clientRequestId: '00000000-0000-4000-8000-000000000005',
          latitude: -6.792354,
          longitude: 39.208328,
          accuracyMeters: 8.5,
          deviceIdentifier: 'android-SM-A546E-8f3b21c9',
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
          clientRequestId: '00000000-0000-4000-8000-000000000006',
          latitude: -6.792354,
          longitude: 39.208328,
          accuracyMeters: 8.5,
          deviceIdentifier: 'android-SM-A546E-8f3b21c9',
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
        clientRequestId: '00000000-0000-4000-8000-000000000007',
        latitude: -6.792354,
        longitude: 39.208328,
        accuracyMeters: 8.5,
        deviceIdentifier: 'android-SM-A546E-8f3b21c9',
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
          clientRequestId: '00000000-0000-4000-8000-000000000008',
          latitude: -6.792354,
          longitude: 39.208328,
          accuracyMeters: 8.5,
          deviceIdentifier: 'android-SM-A546E-8f3b21c9',
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

  it('does not require branch geofence matching when policy and checkpoints do not require GPS', async () => {
    checkpointRepository.find.mockResolvedValue([]);
    wifiRepo.findActiveForBranch.mockResolvedValue([]);

    const result = await service.checkIn({
      companyId: 1,
      authenticatedEmployeeId: 39,
      employeeId: 39,
      dto: {
        clientRequestId: '00000000-0000-4000-8000-000000000009',
        latitude: -6.792354,
        longitude: 39.208328,
        accuracyMeters: 8.5,
        deviceIdentifier: 'android-SM-A546E-8f3b21c9',
      },
      requestIp: '10.40.1.24',
      userAgent: 'jest',
    });

    expect(geofenceRepo.findActiveForBranch).not.toHaveBeenCalled();
    expect(
      geofenceDistanceService.validateCircleGeofence,
    ).not.toHaveBeenCalled();
    expect(result.punch).toEqual(
      expect.objectContaining({
        geofenceId: null,
        validationStatus: AttendancePunchValidationStatusEnum.APPROVED,
      }),
    );
  });

  it('still enforces geofence matching when the active policy requires geo fencing', async () => {
    attendanceCompanyConfigService.resolvePolicyForCompany.mockResolvedValue({
      id: 12,
      company_id: 1,
      is_active: true,
      authentication_modes: 'MOBILE_APP,WEB',
      require_geo_fencing: true,
      allow_multi_device_login: true,
    });
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
        clientRequestId: '00000000-0000-4000-8000-000000000010',
        latitude: -6.792354,
        longitude: 39.208328,
        accuracyMeters: 8.5,
        deviceIdentifier: 'android-SM-A546E-8f3b21c9',
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
      message:
        'Location is outside the allowed geofence. Distance 140m, allowed 60m.',
    });

    let thrown: BadRequestException | null = null;

    try {
      await service.checkIn({
        companyId: 1,
        authenticatedEmployeeId: 39,
        employeeId: 39,
        dto: {
          clientRequestId: '00000000-0000-4000-8000-000000000011',
          latitude: -6.791,
          longitude: 39.21,
          accuracyMeters: 5,
          overrideReason: 'New check in',
          deviceIdentifier: 'android-SM-A546E-8f3b21c9',
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
      message:
        'Invalid WiFi SSID. Required Alliance-HQ-Staff, received Guest-WiFi.',
    });

    let thrown: BadRequestException | null = null;

    try {
      await service.checkIn({
        companyId: 1,
        authenticatedEmployeeId: 39,
        employeeId: 39,
        dto: {
          clientRequestId: '00000000-0000-4000-8000-000000000012',
          latitude: -6.792354,
          longitude: 39.208328,
          wifiSsid: 'Guest-WiFi',
          wifiBssid: 'AA:BB:CC:DD:EE:FF',
          ipAddress: '10.40.1.24',
          overrideReason: 'New check in',
          deviceIdentifier: 'android-SM-A546E-8f3b21c9',
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
        type: AttendanceCheckpointTypeEnum.DEVICE,
        deviceId: 4,
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
        clientRequestId: '00000000-0000-4000-8000-000000000013',
        latitude: -6.792354,
        longitude: 39.208328,
        overrideReason: 'Need manager review',
        deviceIdentifier: 'android-SM-A546E-8f3b21c9',
      },
      requestIp: '10.40.1.24',
      userAgent: 'jest',
    });

    expect(result.message).toBe('Attendance punch saved as pending override.');
    expect(punchRepo.createEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        geofenceId: null,
        validationStatus: AttendancePunchValidationStatusEnum.PENDING_OVERRIDE,
        isOverrideRequested: true,
        overrideReason: 'Need manager review',
      }),
    );
  });

  it('rejects a checkout from a different device when multi-device login is disabled', async () => {
    attendanceCompanyConfigService.resolvePolicyForCompany.mockResolvedValue({
      id: 12,
      company_id: 1,
      is_active: true,
      authentication_modes: 'MOBILE_APP,WEB',
      require_geo_fencing: false,
      allow_multi_device_login: false,
    });
    checkpointRepository.find.mockResolvedValue([]);
    wifiRepo.findActiveForBranch.mockResolvedValue([]);
    punchRepo.findApprovedForEmployeeWindow.mockResolvedValue([
      {
        punchType: AttendancePunchTypeEnum.CHECK_IN,
        validationStatus: AttendancePunchValidationStatusEnum.APPROVED,
        deviceIdentifier: 'trusted-device-001',
      },
    ]);

    await expect(
      service.checkOut({
        companyId: 1,
        authenticatedEmployeeId: 39,
        employeeId: 39,
        dto: {
          clientRequestId: '00000000-0000-4000-8000-000000000014',
          latitude: -6.792354,
          longitude: 39.208328,
          deviceIdentifier: 'other-device-999',
        },
        requestIp: '10.40.1.24',
        userAgent: 'jest',
      }),
    ).rejects.toMatchObject({
      response: {
        message:
          'Multiple mobile devices are not allowed for the active attendance policy. Use the first trusted device used for this attendance day.',
      },
    });

    expect(punchRepo.save).not.toHaveBeenCalled();
  });

  it('rejects check-in when the active policy disallows mobile authentication', async () => {
    attendanceCompanyConfigService.resolvePolicyForCompany.mockResolvedValue({
      id: 12,
      company_id: 1,
      is_active: true,
      authentication_modes: 'BIOMETRIC_ONLY',
      require_geo_fencing: false,
    });

    await expect(
      service.checkIn({
        companyId: 1,
        authenticatedEmployeeId: 39,
        employeeId: 39,
        dto: {
          clientRequestId: '00000000-0000-4000-8000-000000000015',
          latitude: -6.792354,
          longitude: 39.208328,
          deviceIdentifier: 'android-SM-A546E-8f3b21c9',
        },
      }),
    ).rejects.toThrow(BadRequestException);

    expect(scheduleResolver.resolveForDate).not.toHaveBeenCalled();
  });
});
