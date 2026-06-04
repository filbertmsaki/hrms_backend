import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { Branch } from '../../../hr/branches/entities/branch.entity';
import { AttendanceDevice } from '../../../hr/attendance/devices/entities/attendance-device.entity';
import { buildPaginationMeta } from '../../../hr/shared/hr.utils';
import { HikvisionDoorSyncService } from '../../../hikvision/hikvision-door.service';
import { AccessDoorSyncStatusEnum } from '../enum/access-door-sync-status.enum';
import { AccessDoor } from '../entity/access-door.entity';
import { CreateAccessDoorDto } from '../dto/create-access-door.dto';
import { UpdateAccessDoorDto } from '../dto/update-access-door.dto';

type AccessDoorQuery = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: SortDirection;
  device_id?: number;
  branch_id?: number;
  sync_status?: AccessDoorSyncStatusEnum;
  search?: string;
};

@Injectable()
export class AccessDoorsService {
  constructor(
    @InjectRepository(AccessDoor)
    private readonly accessDoorRepository: Repository<AccessDoor>,
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    private readonly hikvisionDoorSyncService: HikvisionDoorSyncService,
  ) {}

  async create(companyId: number, dto: CreateAccessDoorDto) {
    const device = await this.ensureDevice(companyId, dto.device_id);
    const branchId = dto.branch_id ?? device.branchId ?? null;
    await this.ensureBranch(companyId, branchId);
    await this.ensureUniqueDoor(companyId, dto.device_id, dto.door_no);

    const created = await this.accessDoorRepository.save(
      this.accessDoorRepository.create({
        companyId,
        branchId,
        deviceId: dto.device_id,
        doorNo: dto.door_no,
        doorName: dto.door_name.trim(),
        magneticType: dto.magnetic_type?.trim() || null,
        openButtonType: dto.open_button_type?.trim() || null,
        openDuration: dto.open_duration ?? null,
        disabledOpenDuration: dto.disabled_open_duration ?? null,
        magneticAlarmTimeout: dto.magnetic_alarm_timeout ?? null,
        enableLeaderCard: dto.enable_leader_card ?? null,
        leaderCardMode: dto.leader_card_mode?.trim() || null,
        leaderCardOpenDuration: dto.leader_card_open_duration ?? null,
        remoteControlPwStatus: dto.remote_control_pw_status ?? null,
        syncStatus: dto.sync_status ?? AccessDoorSyncStatusEnum.PENDING,
        metadata: dto.metadata ?? null,
      }),
    );

    return this.map(created);
  }

  async findAll(companyId: number, query: AccessDoorQuery) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      device_id,
      branch_id,
      sync_status,
      search,
    } = query;

    const qb = this.accessDoorRepository
      .createQueryBuilder('door')
      .where('door.company_id = :companyId', { companyId });

    if (device_id) {
      qb.andWhere('door.device_id = :deviceId', { deviceId: device_id });
    }
    if (branch_id) {
      qb.andWhere('door.branch_id = :branchId', { branchId: branch_id });
    }
    if (sync_status) {
      qb.andWhere('door.sync_status = :syncStatus', { syncStatus: sync_status });
    }
    if (search?.trim()) {
      qb.andWhere('(door.door_name LIKE :term OR door.door_no LIKE :term)', {
        term: `%${search.trim()}%`,
      });
    }

    const allowedSortFields = ['created_at', 'updated_at', 'door_name', 'door_no', 'sync_status'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const sortFieldMap: Record<string, string> = {
      created_at: 'created_at',
      updated_at: 'updated_at',
      door_name: 'door_name',
      door_no: 'door_no',
      sync_status: 'sync_status',
    };

    const [items, total] = await qb
      .orderBy(`door.${sortFieldMap[safeSortBy]}`, direction)
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

  async update(companyId: number, id: number, dto: UpdateAccessDoorDto) {
    const item = await this.findOrFail(companyId, id);
    const nextDeviceId = dto.device_id ?? item.deviceId;
    const nextDoorNo = dto.door_no ?? item.doorNo;

    if (nextDeviceId === null) {
      throw new BadRequestException('device_id is required to update an access door');
    }

    const device = await this.ensureDevice(companyId, nextDeviceId);
    const branchId = dto.branch_id !== undefined ? dto.branch_id : item.branchId ?? device.branchId ?? null;
    await this.ensureBranch(companyId, branchId);
    await this.ensureUniqueDoor(companyId, nextDeviceId, nextDoorNo, item.id);

    item.deviceId = nextDeviceId;
    item.branchId = branchId;
    item.doorNo = nextDoorNo;

    if (dto.door_name !== undefined) item.doorName = dto.door_name.trim();
    if (dto.magnetic_type !== undefined) item.magneticType = dto.magnetic_type?.trim() || null;
    if (dto.open_button_type !== undefined) item.openButtonType = dto.open_button_type?.trim() || null;
    if (dto.open_duration !== undefined) item.openDuration = dto.open_duration;
    if (dto.disabled_open_duration !== undefined) item.disabledOpenDuration = dto.disabled_open_duration;
    if (dto.magnetic_alarm_timeout !== undefined) item.magneticAlarmTimeout = dto.magnetic_alarm_timeout;
    if (dto.enable_leader_card !== undefined) item.enableLeaderCard = dto.enable_leader_card;
    if (dto.leader_card_mode !== undefined) item.leaderCardMode = dto.leader_card_mode?.trim() || null;
    if (dto.leader_card_open_duration !== undefined) {
      item.leaderCardOpenDuration = dto.leader_card_open_duration;
    }
    if (dto.remote_control_pw_status !== undefined) {
      item.remoteControlPwStatus = dto.remote_control_pw_status;
    }
    if (dto.sync_status !== undefined) item.syncStatus = dto.sync_status;
    if (dto.metadata !== undefined) item.metadata = dto.metadata;

    if (dto.sync_status === undefined) {
      item.syncStatus = AccessDoorSyncStatusEnum.PENDING;
    }

    return this.map(await this.accessDoorRepository.save(item));
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.accessDoorRepository.remove(item);
    return { message: 'Access door deleted successfully' };
  }

  async syncFromDevice(companyId: number, deviceId: number) {
    await this.ensureDevice(companyId, deviceId);
    return this.hikvisionDoorSyncService.syncFromDevice(companyId, deviceId);
  }

  async syncToDevice(companyId: number, id: number) {
    const door = await this.findOrFail(companyId, id);
    return this.hikvisionDoorSyncService.syncDoorToDevice(companyId, door);
  }

  async getDoorConfiguration(companyId: number, id: number) {
    const door = await this.findOrFail(companyId, id);
    return this.hikvisionDoorSyncService.getDoorConfiguration(companyId, door);
  }

  async openDoor(companyId: number, id: number) {
    const door = await this.findOrFail(companyId, id);
    return this.hikvisionDoorSyncService.remoteControlDoor(companyId, door, 'open');
  }

  async closeDoor(companyId: number, id: number) {
    const door = await this.findOrFail(companyId, id);
    return this.hikvisionDoorSyncService.remoteControlDoor(companyId, door, 'close');
  }

  async alwaysOpenDoor(companyId: number, id: number) {
    const door = await this.findOrFail(companyId, id);
    return this.hikvisionDoorSyncService.remoteControlDoor(companyId, door, 'alwaysOpen');
  }

  async alwaysCloseDoor(companyId: number, id: number) {
    const door = await this.findOrFail(companyId, id);
    return this.hikvisionDoorSyncService.remoteControlDoor(companyId, door, 'alwaysClose');
  }

  private map(item: AccessDoor) {
    return {
      id: item.id,
      company_id: item.companyId,
      branch_id: item.branchId,
      device_id: item.deviceId,
      door_no: item.doorNo,
      door_name: item.doorName,
      magnetic_type: item.magneticType,
      open_button_type: item.openButtonType,
      open_duration: item.openDuration,
      disabled_open_duration: item.disabledOpenDuration,
      magnetic_alarm_timeout: item.magneticAlarmTimeout,
      enable_leader_card: item.enableLeaderCard,
      leader_card_mode: item.leaderCardMode,
      leader_card_open_duration: item.leaderCardOpenDuration,
      remote_control_pw_status: item.remoteControlPwStatus,
      sync_status: item.syncStatus,
      last_synced_at: item.lastSyncedAt,
      metadata: item.metadata,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      deleted_at: item.deletedAt,
    };
  }

  private async findOrFail(companyId: number, id: number): Promise<AccessDoor> {
    const item = await this.accessDoorRepository.findOne({ where: { id, companyId } });
    if (!item) {
      throw new NotFoundException('Access door not found');
    }
    return item;
  }

  private async ensureDevice(companyId: number, deviceId: number): Promise<AttendanceDevice> {
    const device = await this.attendanceDeviceRepository.findOne({
      where: { id: deviceId, companyId },
      select: ['id', 'companyId', 'branchId'],
    });
    if (!device) {
      throw new BadRequestException('device_id does not belong to the active company');
    }
    return device;
  }

  private async ensureBranch(companyId: number, branchId?: number | null): Promise<void> {
    if (!branchId) {
      return;
    }
    const branch = await this.branchRepository.findOne({
      where: { id: branchId, company_id: companyId },
      select: ['id'],
    });
    if (!branch) {
      throw new BadRequestException('branch_id does not belong to the active company');
    }
  }

  private async ensureUniqueDoor(
    companyId: number,
    deviceId: number,
    doorNo: number,
    currentId?: number,
  ): Promise<void> {
    const existing = await this.accessDoorRepository.findOne({
      where: { companyId, deviceId, doorNo },
      select: ['id'],
    });
    if (existing && existing.id !== currentId) {
      throw new ConflictException('door_no already exists for this device');
    }
  }
}
