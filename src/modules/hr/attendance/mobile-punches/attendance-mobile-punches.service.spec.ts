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

describe('AttendanceMobilePunchesService', () => {
  let service: AttendanceMobilePunchesService;
  let punchRepo: {
    createEntity: jest.Mock;
    save: jest.Mock;
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
  let employeeQueryBuilder: EmployeeQueryBuilderMock;

  beforeEach(() => {
    punchRepo = {
      createEntity: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
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
      policyRepository as unknown as Repository<AttendancePolicy>,
      checkpointRepository as unknown as Repository<AttendanceCheckpoint>,
      employeeRepository as unknown as Repository<Employee>,
    );

    employeeQueryBuilder.getOne.mockResolvedValue({
      id: 39,
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
        message: 'Attendance punch rejected.',
        errors: expect.arrayContaining([
          'Location does not match any allowed geofence for the active attendance checkpoints.',
        ]),
      }),
    );
  });

  it('rejects provided WiFi details when they do not match an allowed office network', async () => {
    checkpointRepository.find.mockResolvedValue([]);
    geofenceRepo.findActiveForBranch.mockResolvedValue([]);
    wifiRepo.findActiveForBranch.mockResolvedValue([
      {
        id: 44,
        name: 'Alliance-HQ-Staff',
        branchId: 5,
      },
    ]);
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
        message: 'Attendance punch rejected.',
        errors: expect.arrayContaining([
          'WiFi network does not match any allowed office network.',
          'Invalid WiFi SSID. Required Alliance-HQ-Staff, received Guest-WiFi.',
        ]),
      }),
    );
  });
});
