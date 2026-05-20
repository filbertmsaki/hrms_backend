import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { Branch } from '../../branches/entities/branch.entity';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { AttendanceDevice } from './entities/attendance-device.entity';
import { AttendanceDeviceQueryDto } from './dtos/attendance-device-query.dto';
import { CreateAttendanceDeviceDto } from './dtos/create-attendance-device.dto';
import { UpdateAttendanceDeviceDto } from './dtos/update-attendance-device.dto';

@Injectable()
export class AttendanceDevicesService {
  constructor(
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  private map(item: AttendanceDevice) {
    return {
      id: item.id,
      company_id: item.companyId,
      branch_id: item.branchId,
      device_name: item.deviceName,
      device_code: item.deviceCode,
      device_serial_number: item.deviceSerialNumber,
      device_model: item.deviceModel,
      ip_address: item.ipAddress,
      port: item.port,
      protocol: item.protocol,
      api_username: item.apiUsername,
      sync_mode: item.syncMode,
      status: item.status,
      last_sync_at: item.lastSyncAt,
      last_heartbeat_at: item.lastHeartbeatAt,
      timezone: item.timezone,
      location_description: item.locationDescription,
      metadata: item.metadata,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      deleted_at: item.deletedAt,
    };
  }

  private async findOrFail(companyId: number, id: number): Promise<AttendanceDevice> {
    const item = await this.attendanceDeviceRepository.findOne({ where: { id, companyId } });
    if (!item) {
      throw new NotFoundException('Attendance device not found');
    }
    return item;
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

  async create(companyId: number, dto: CreateAttendanceDeviceDto) {
    await this.ensureBranch(companyId, dto.branch_id);

    const existing = await this.attendanceDeviceRepository.findOne({
      where: { deviceCode: dto.device_code },
      select: ['id'],
      withDeleted: true,
    });

    if (existing) {
      throw new ConflictException('device_code already exists');
    }

    const created = await this.attendanceDeviceRepository.save(
      this.attendanceDeviceRepository.create({
        companyId,
        branchId: dto.branch_id ?? null,
        deviceName: dto.device_name.trim(),
        deviceCode: dto.device_code.trim(),
        deviceSerialNumber: dto.device_serial_number.trim(),
        deviceModel: dto.device_model.trim(),
        ipAddress: dto.ip_address,
        port: dto.port,
        protocol: dto.protocol.trim(),
        apiUsername: dto.api_username.trim(),
        apiPassword: dto.api_password,
        syncMode: dto.sync_mode,
        status: dto.status,
        timezone: dto.timezone.trim(),
        locationDescription: dto.location_description?.trim() || null,
        metadata: dto.metadata ?? null,
      }),
    );

    return this.map(created);
  }

  async findAll(companyId: number, query: AttendanceDeviceQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      status,
      branch_id,
      search,
    } = query;

    const qb = this.attendanceDeviceRepository
      .createQueryBuilder('attendanceDevice')
      .where('attendanceDevice.company_id = :companyId', { companyId });

    if (status) {
      qb.andWhere('attendanceDevice.status = :status', { status });
    }

    if (branch_id) {
      qb.andWhere('attendanceDevice.branch_id = :branchId', { branchId: branch_id });
    }

    if (search?.trim()) {
      qb.andWhere(
        '(attendanceDevice.device_name LIKE :term OR attendanceDevice.device_code LIKE :term OR attendanceDevice.device_serial_number LIKE :term)',
        { term: `%${search.trim()}%` },
      );
    }

    const allowedSortFields = ['created_at', 'updated_at', 'device_name', 'status', 'last_sync_at'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const sortFieldMap: Record<string, string> = {
      created_at: 'created_at',
      updated_at: 'updated_at',
      device_name: 'device_name',
      status: 'status',
      last_sync_at: 'last_sync_at',
    };

    const [items, total] = await qb
      .orderBy(`attendanceDevice.${sortFieldMap[safeSortBy]}`, direction)
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

  async update(companyId: number, id: number, dto: UpdateAttendanceDeviceDto) {
    const item = await this.findOrFail(companyId, id);

    if (dto.branch_id !== undefined) {
      await this.ensureBranch(companyId, dto.branch_id);
      item.branchId = dto.branch_id ?? null;
    }

    if (dto.device_code !== undefined) {
      const code = dto.device_code.trim();
      const existing = await this.attendanceDeviceRepository.findOne({
        where: { deviceCode: code },
        select: ['id'],
        withDeleted: true,
      });
      if (existing && existing.id !== item.id) {
        throw new ConflictException('device_code already exists');
      }
      item.deviceCode = code;
    }

    if (dto.device_name !== undefined) item.deviceName = dto.device_name.trim();
    if (dto.device_serial_number !== undefined)
      item.deviceSerialNumber = dto.device_serial_number.trim();
    if (dto.device_model !== undefined) item.deviceModel = dto.device_model.trim();
    if (dto.ip_address !== undefined) item.ipAddress = dto.ip_address;
    if (dto.port !== undefined) item.port = dto.port;
    if (dto.protocol !== undefined) item.protocol = dto.protocol.trim();
    if (dto.api_username !== undefined) item.apiUsername = dto.api_username.trim();
    if (dto.api_password !== undefined) item.apiPassword = dto.api_password;
    if (dto.sync_mode !== undefined) item.syncMode = dto.sync_mode;
    if (dto.status !== undefined) item.status = dto.status;
    if (dto.timezone !== undefined) item.timezone = dto.timezone.trim();
    if (dto.location_description !== undefined)
      item.locationDescription = dto.location_description?.trim() || null;
    if (dto.metadata !== undefined) item.metadata = dto.metadata;

    return this.map(await this.attendanceDeviceRepository.save(item));
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.attendanceDeviceRepository.softRemove(item);
    return { message: 'Attendance device deleted successfully' };
  }
}






