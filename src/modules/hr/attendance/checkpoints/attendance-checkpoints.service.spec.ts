import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceGeofence } from '../geofences/entities/attendance-geofence.entity';
import { AttendancePolicy } from '../policies/entities/attendance-policy.entity';
import { AttendanceWifiNetwork } from '../wifi-networks/entities/attendance-wifi-network.entity';
import { AttendanceCheckpointsService } from './attendance-checkpoints.service';
import { AttendanceCheckpoint } from './entities/attendance-checkpoint.entity';
import { AttendanceCheckpointStatusEnum } from './enums/attendance-checkpoint-status.enum';
import { AttendanceCheckpointTypeEnum } from './enums/attendance-checkpoint-type.enum';

type MockRepository<T extends object = Record<string, unknown>> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

function createRepositoryMock<T extends object>(): MockRepository<T> {
  return {
    create: jest.fn((value) => value),
    save: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

describe('AttendanceCheckpointsService', () => {
  let checkpointRepo: MockRepository<AttendanceCheckpoint>;
  let policyRepo: MockRepository<AttendancePolicy>;
  let deviceRepo: MockRepository<AttendanceDevice>;
  let geofenceRepo: MockRepository<AttendanceGeofence>;
  let wifiNetworkRepo: MockRepository<AttendanceWifiNetwork>;
  let service: AttendanceCheckpointsService;
  let nextId: number;

  const savedCheckpoint = (overrides: Partial<AttendanceCheckpoint> = {}) =>
    ({
      id: overrides.id ?? 11,
      policySetId: overrides.policySetId ?? 7,
      name: overrides.name ?? 'HQ GPS',
      type: overrides.type ?? AttendanceCheckpointTypeEnum.GPS,
      deviceId: overrides.deviceId ?? null,
      geofenceId: overrides.geofenceId ?? 17,
      wifiNetworkId: overrides.wifiNetworkId ?? null,
      isRequired: overrides.isRequired ?? true,
      allowOverride: overrides.allowOverride ?? false,
      maxDistanceMeters: overrides.maxDistanceMeters ?? 90,
      strictMode: overrides.strictMode ?? true,
      status: overrides.status ?? AttendanceCheckpointStatusEnum.ACTIVE,
      createdAt: overrides.createdAt ?? new Date('2026-09-01T08:00:00Z'),
      updatedAt: overrides.updatedAt ?? new Date('2026-09-01T08:00:00Z'),
      policySet: overrides.policySet ?? ({ company_id: 1 } as AttendancePolicy),
    }) as AttendanceCheckpoint;

  beforeEach(() => {
    checkpointRepo = createRepositoryMock<AttendanceCheckpoint>();
    policyRepo = createRepositoryMock<AttendancePolicy>();
    deviceRepo = createRepositoryMock<AttendanceDevice>();
    geofenceRepo = createRepositoryMock<AttendanceGeofence>();
    wifiNetworkRepo = createRepositoryMock<AttendanceWifiNetwork>();
    nextId = 20;

    policyRepo.findOne!.mockResolvedValue({ id: 7 });
    deviceRepo.findOne!.mockResolvedValue({ id: 5 });
    geofenceRepo.findOne!.mockResolvedValue({ id: 17 });
    wifiNetworkRepo.findOne!.mockResolvedValue({ id: 9 });
    checkpointRepo.findOne!.mockImplementation(
      async (options?: { where?: Record<string, unknown>; select?: string[] }) => {
        const where = options?.where ?? {};
        if (where.id) {
          return savedCheckpoint({
            id: Number(where.id),
            policySet: { company_id: 1 } as AttendancePolicy,
          });
        }
        return null;
      },
    );
    checkpointRepo.save!.mockImplementation(async (value: Partial<AttendanceCheckpoint>) => ({
      ...value,
      id: value.id ?? nextId++,
    }));

    service = new AttendanceCheckpointsService(
      checkpointRepo as Repository<AttendanceCheckpoint>,
      policyRepo as Repository<AttendancePolicy>,
      deviceRepo as Repository<AttendanceDevice>,
      geofenceRepo as Repository<AttendanceGeofence>,
      wifiNetworkRepo as Repository<AttendanceWifiNetwork>,
    );
  });

  it('creates a GPS checkpoint only when it points at a company geofence', async () => {
    await service.create(1, {
      policy_set_id: 7,
      name: ' HQ GPS ',
      type: AttendanceCheckpointTypeEnum.GPS,
      geofence_id: 17,
      max_distance_meters: 90,
      strict_mode: true,
    });

    expect(policyRepo.findOne).toHaveBeenCalledWith({
      where: { id: 7, company_id: 1 },
      select: ['id'],
    });
    expect(geofenceRepo.findOne).toHaveBeenCalledWith({
      where: { id: 17, companyId: 1 },
      select: ['id'],
    });
    expect(checkpointRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        policySetId: 7,
        name: 'HQ GPS',
        type: AttendanceCheckpointTypeEnum.GPS,
        deviceId: null,
        geofenceId: 17,
        wifiNetworkId: null,
        maxDistanceMeters: 90,
        strictMode: true,
      }),
    );
  });

  it('creates DEVICE, WIFI, and MANUAL checkpoints with only their allowed resource fields', async () => {
    await service.create(1, {
      policy_set_id: 7,
      name: 'Device Gate',
      type: AttendanceCheckpointTypeEnum.DEVICE,
      device_id: 5,
    });
    await service.create(1, {
      policy_set_id: 7,
      name: 'Office WiFi',
      type: AttendanceCheckpointTypeEnum.WIFI,
      wifi_network_id: 9,
    });
    await service.create(1, {
      policy_set_id: 7,
      name: 'Manager Manual',
      type: AttendanceCheckpointTypeEnum.MANUAL,
      is_required: false,
      allow_override: true,
    });

    expect(checkpointRepo.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: AttendanceCheckpointTypeEnum.DEVICE,
        deviceId: 5,
        geofenceId: null,
        wifiNetworkId: null,
      }),
    );
    expect(checkpointRepo.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: AttendanceCheckpointTypeEnum.WIFI,
        deviceId: null,
        geofenceId: null,
        wifiNetworkId: 9,
      }),
    );
    expect(checkpointRepo.save).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        type: AttendanceCheckpointTypeEnum.MANUAL,
        deviceId: null,
        geofenceId: null,
        wifiNetworkId: null,
        isRequired: false,
        allowOverride: true,
      }),
    );
  });

  it.each([
    [
      'DEVICE without device',
      {
        policy_set_id: 7,
        name: 'Device Gate',
        type: AttendanceCheckpointTypeEnum.DEVICE,
      },
      'device_id is required for DEVICE checkpoints',
    ],
    [
      'DEVICE mixed with geofence',
      {
        policy_set_id: 7,
        name: 'Device Gate',
        type: AttendanceCheckpointTypeEnum.DEVICE,
        device_id: 5,
        geofence_id: 17,
      },
      'DEVICE checkpoints cannot include geofence_id or wifi_network_id',
    ],
    [
      'GPS without geofence',
      {
        policy_set_id: 7,
        name: 'HQ GPS',
        type: AttendanceCheckpointTypeEnum.GPS,
      },
      'geofence_id is required for GPS checkpoints',
    ],
    [
      'WIFI without network',
      {
        policy_set_id: 7,
        name: 'Office WiFi',
        type: AttendanceCheckpointTypeEnum.WIFI,
      },
      'wifi_network_id is required for WIFI checkpoints',
    ],
    [
      'MANUAL with device',
      {
        policy_set_id: 7,
        name: 'Manual Review',
        type: AttendanceCheckpointTypeEnum.MANUAL,
        device_id: 5,
      },
      'MANUAL checkpoints cannot include device_id, geofence_id, or wifi_network_id',
    ],
    [
      'QR phase-one unsupported',
      {
        policy_set_id: 7,
        name: 'QR Gate',
        type: AttendanceCheckpointTypeEnum.QR,
      },
      'QR checkpoint is not supported in Phase One. Use GPS, WIFI, DEVICE or MANUAL checkpoint.',
    ],
    [
      'WIFI with max distance',
      {
        policy_set_id: 7,
        name: 'Office WiFi',
        type: AttendanceCheckpointTypeEnum.WIFI,
        wifi_network_id: 9,
        max_distance_meters: 25,
      },
      'max_distance_meters is only supported for GPS checkpoints',
    ],
  ])('rejects invalid checkpoint config: %s', async (_caseName, dto, message) => {
    await expect(service.create(1, dto)).rejects.toThrow(
      new BadRequestException(message),
    );
    expect(checkpointRepo.save).not.toHaveBeenCalled();
  });

  it('rejects policy, device, geofence, and WiFi resources outside the company', async () => {
    policyRepo.findOne!.mockResolvedValueOnce(null);
    await expect(
      service.create(1, {
        policy_set_id: 7,
        name: 'HQ GPS',
        type: AttendanceCheckpointTypeEnum.GPS,
        geofence_id: 17,
      }),
    ).rejects.toThrow(
      new BadRequestException('policy_set_id does not belong to the active company'),
    );

    deviceRepo.findOne!.mockResolvedValueOnce(null);
    await expect(
      service.create(1, {
        policy_set_id: 7,
        name: 'Device Gate',
        type: AttendanceCheckpointTypeEnum.DEVICE,
        device_id: 5,
      }),
    ).rejects.toThrow(
      new BadRequestException('device_id does not belong to the active company'),
    );

    geofenceRepo.findOne!.mockResolvedValueOnce(null);
    await expect(
      service.create(1, {
        policy_set_id: 7,
        name: 'HQ GPS',
        type: AttendanceCheckpointTypeEnum.GPS,
        geofence_id: 17,
      }),
    ).rejects.toThrow(
      new BadRequestException('geofence_id does not belong to the active company'),
    );

    wifiNetworkRepo.findOne!.mockResolvedValueOnce(null);
    await expect(
      service.create(1, {
        policy_set_id: 7,
        name: 'Office WiFi',
        type: AttendanceCheckpointTypeEnum.WIFI,
        wifi_network_id: 9,
      }),
    ).rejects.toThrow(
      new BadRequestException('wifi_network_id does not belong to the active company'),
    );
  });

  it('rejects duplicate checkpoint names within the same policy set', async () => {
    checkpointRepo.findOne!.mockResolvedValueOnce({ id: 30 });

    await expect(
      service.create(1, {
        policy_set_id: 7,
        name: 'HQ GPS',
        type: AttendanceCheckpointTypeEnum.GPS,
        geofence_id: 17,
      }),
    ).rejects.toThrow(
      new ConflictException('Checkpoint name already exists under this policy set'),
    );
  });

  it('validates an update against the existing checkpoint resource fields', async () => {
    await service.update(1, 11, {
      type: AttendanceCheckpointTypeEnum.WIFI,
      geofence_id: null,
      wifi_network_id: 9,
      max_distance_meters: null,
    });

    expect(wifiNetworkRepo.findOne).toHaveBeenCalledWith({
      where: { id: 9, companyId: 1 },
      select: ['id'],
    });
    expect(checkpointRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 11,
        policySetId: 7,
        type: AttendanceCheckpointTypeEnum.WIFI,
        deviceId: null,
        geofenceId: null,
        wifiNetworkId: 9,
        maxDistanceMeters: null,
      }),
    );
  });

  it('blocks updates that would leave a checkpoint with an invalid resource mix', async () => {
    await expect(
      service.update(1, 11, {
        type: AttendanceCheckpointTypeEnum.MANUAL,
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'MANUAL checkpoints cannot include device_id, geofence_id, or wifi_network_id',
      ),
    );
  });

  it('does not return checkpoints across company boundaries', async () => {
    checkpointRepo.findOne!.mockResolvedValueOnce(
      savedCheckpoint({
        policySet: { company_id: 2 } as AttendancePolicy,
      }),
    );

    await expect(service.findOne(1, 11)).rejects.toThrow(
      new NotFoundException('Attendance checkpoint not found'),
    );
  });
});
