import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { AttendanceCheckpoint } from './entities/attendance-checkpoint.entity';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendancePolicy } from '../policies/entities/attendance-policy.entity';
import { AttendanceGeofence } from '../geofences/entities/attendance-geofence.entity';
import { AttendanceWifiNetwork } from '../wifi-networks/entities/attendance-wifi-network.entity';
import { AttendanceCheckpointQueryDto } from './dtos/attendance-checkpoint-query.dto';
import { CreateAttendanceCheckpointDto } from './dtos/create-attendance-checkpoint.dto';
import { UpdateAttendanceCheckpointDto } from './dtos/update-attendance-checkpoint.dto';

@Injectable()
export class AttendanceCheckpointsService {
  constructor(
    @InjectRepository(AttendanceCheckpoint)
    private readonly attendanceCheckpointRepository: Repository<AttendanceCheckpoint>,
    @InjectRepository(AttendancePolicy)
    private readonly attendancePolicyRepository: Repository<AttendancePolicy>,
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(AttendanceGeofence)
    private readonly attendanceGeofenceRepository: Repository<AttendanceGeofence>,
    @InjectRepository(AttendanceWifiNetwork)
    private readonly attendanceWifiNetworkRepository: Repository<AttendanceWifiNetwork>,
  ) {}

  private map(item: AttendanceCheckpoint) {
    return {
      id: item.id,
      policy_set_id: item.policySetId,
      name: item.name,
      type: item.type,
      device_id: item.deviceId,
      geofence_id: item.geofenceId,
      wifi_network_id: item.wifiNetworkId,
      is_required: item.isRequired,
      allow_override: item.allowOverride,
      max_distance_meters: item.maxDistanceMeters,
      strict_mode: item.strictMode,
      status: item.status,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
  }

  private async ensurePolicySet(companyId: number, policySetId: number): Promise<void> {
    const policySet = await this.attendancePolicyRepository.findOne({
      where: { id: policySetId, company_id: companyId },
      select: ['id'],
    });

    if (!policySet) {
      throw new BadRequestException('policy_set_id does not belong to the active company');
    }
  }

  private async ensureDevice(companyId: number, deviceId?: number | null): Promise<void> {
    if (!deviceId) {
      return;
    }

    const device = await this.attendanceDeviceRepository.findOne({
      where: { id: deviceId, companyId },
      select: ['id'],
    });

    if (!device) {
      throw new BadRequestException('device_id does not belong to the active company');
    }
  }

  private async ensureGeofence(companyId: number, geofenceId?: number | null): Promise<void> {
    if (!geofenceId) {
      return;
    }

    const geofence = await this.attendanceGeofenceRepository.findOne({
      where: { id: geofenceId, companyId },
      select: ['id'],
    });

    if (!geofence) {
      throw new BadRequestException('geofence_id does not belong to the active company');
    }
  }

  private async ensureWifiNetwork(companyId: number, wifiNetworkId?: number | null): Promise<void> {
    if (!wifiNetworkId) {
      return;
    }

    const wifiNetwork = await this.attendanceWifiNetworkRepository.findOne({
      where: { id: wifiNetworkId, companyId },
      select: ['id'],
    });

    if (!wifiNetwork) {
      throw new BadRequestException('wifi_network_id does not belong to the active company');
    }
  }

  private async findOrFail(companyId: number, id: number): Promise<AttendanceCheckpoint> {
    const item = await this.attendanceCheckpointRepository
      .createQueryBuilder('attendanceCheckpoint')
      .innerJoin(
        AttendancePolicy,
        'attendancePolicy',
        'attendancePolicy.id = attendanceCheckpoint.policy_set_id',
      )
      .where('attendanceCheckpoint.id = :id', { id })
      .andWhere('attendancePolicy.company_id = :companyId', { companyId })
      .getOne();

    if (!item) {
      throw new NotFoundException('Attendance checkpoint not found');
    }

    return item;
  }

  async create(companyId: number, dto: CreateAttendanceCheckpointDto) {
    await this.ensurePolicySet(companyId, dto.policy_set_id);
    await this.ensureDevice(companyId, dto.device_id);
    await this.ensureGeofence(companyId, dto.geofence_id);
    await this.ensureWifiNetwork(companyId, dto.wifi_network_id);

    const existing = await this.attendanceCheckpointRepository.findOne({
      where: {
        policySetId: dto.policy_set_id,
        name: dto.name.trim(),
      },
      select: ['id'],
    });

    if (existing) {
      throw new ConflictException('Checkpoint name already exists under this policy set');
    }

    const created = await this.attendanceCheckpointRepository.save(
      this.attendanceCheckpointRepository.create({
        policySetId: dto.policy_set_id,
        name: dto.name.trim(),
        type: dto.type,
        deviceId: dto.device_id ?? null,
        geofenceId: dto.geofence_id ?? null,
        wifiNetworkId: dto.wifi_network_id ?? null,
        isRequired: dto.is_required ?? true,
        allowOverride: dto.allow_override ?? false,
        maxDistanceMeters: dto.max_distance_meters ?? null,
        strictMode: dto.strict_mode ?? false,
        status: dto.status,
      }),
    );

    return this.map(created);
  }

  async findAll(companyId: number, query: AttendanceCheckpointQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      policy_set_id,
      type,
      status,
      search,
    } = query;

    const qb = this.attendanceCheckpointRepository
      .createQueryBuilder('attendanceCheckpoint')
      .innerJoin(
        AttendancePolicy,
        'attendancePolicy',
        'attendancePolicy.id = attendanceCheckpoint.policy_set_id',
      )
      .where('attendancePolicy.company_id = :companyId', { companyId });

    if (policy_set_id) {
      qb.andWhere('attendanceCheckpoint.policy_set_id = :policySetId', {
        policySetId: policy_set_id,
      });
    }

    if (type) {
      qb.andWhere('attendanceCheckpoint.type = :type', { type });
    }

    if (status) {
      qb.andWhere('attendanceCheckpoint.status = :status', { status });
    }

    if (search?.trim()) {
      qb.andWhere('attendanceCheckpoint.name LIKE :term', { term: `%${search.trim()}%` });
    }

    const allowedSortFields = ['name', 'type', 'status', 'created_at', 'updated_at'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const sortFieldMap: Record<string, string> = {
      name: 'name',
      type: 'type',
      status: 'status',
      created_at: 'created_at',
      updated_at: 'updated_at',
    };

    const [items, total] = await qb
      .orderBy(`attendanceCheckpoint.${sortFieldMap[safeSortBy]}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.map(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, id: number) {
    return this.map(await this.findOrFail(companyId, id));
  }

  async update(companyId: number, id: number, dto: UpdateAttendanceCheckpointDto) {
    const item = await this.findOrFail(companyId, id);

    const policySetId = dto.policy_set_id ?? item.policySetId;
    const name = dto.name?.trim() ?? item.name;

    await this.ensurePolicySet(companyId, policySetId);
    await this.ensureDevice(companyId, dto.device_id ?? item.deviceId);
    if (dto.geofence_id !== undefined) await this.ensureGeofence(companyId, dto.geofence_id);
    if (dto.wifi_network_id !== undefined) await this.ensureWifiNetwork(companyId, dto.wifi_network_id);

    const duplicate = await this.attendanceCheckpointRepository.findOne({
      where: {
        policySetId,
        name,
      },
      select: ['id'],
    });

    if (duplicate && duplicate.id !== item.id) {
      throw new ConflictException('Checkpoint name already exists under this policy set');
    }

    item.policySetId = policySetId;
    item.name = name;

    if (dto.type !== undefined) item.type = dto.type;
    if (dto.device_id !== undefined) item.deviceId = dto.device_id ?? null;
    if (dto.geofence_id !== undefined) item.geofenceId = dto.geofence_id ?? null;
    if (dto.wifi_network_id !== undefined) item.wifiNetworkId = dto.wifi_network_id ?? null;
    if (dto.is_required !== undefined) item.isRequired = dto.is_required;
    if (dto.allow_override !== undefined) item.allowOverride = dto.allow_override;
    if (dto.max_distance_meters !== undefined) item.maxDistanceMeters = dto.max_distance_meters;
    if (dto.strict_mode !== undefined) item.strictMode = dto.strict_mode;
    if (dto.status !== undefined) item.status = dto.status;

    return this.map(await this.attendanceCheckpointRepository.save(item));
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.attendanceCheckpointRepository.remove(item);
    return { message: 'Attendance checkpoint deleted successfully' };
  }
}







