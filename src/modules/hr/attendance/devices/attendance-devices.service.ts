import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { EmployeeDeviceAssignment } from '../../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { HikvisionService as DeviceManagementHikvisionService } from '../../../hikvision/hikvision.service';
import { Branch } from '../../branches/entities/branch.entity';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { AttendanceDevice } from './entities/attendance-device.entity';
import { AttendanceDeviceEmployeesQueryDto } from './dtos/attendance-device-employees-query.dto';
import { AttendanceDeviceQueryDto } from './dtos/attendance-device-query.dto';
import { CreateAttendanceDeviceDto } from './dtos/create-attendance-device.dto';
import { UpdateAttendanceDeviceDto } from './dtos/update-attendance-device.dto';

@Injectable()
export class AttendanceDevicesService {
  constructor(
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly employeeDeviceAssignmentRepository: Repository<EmployeeDeviceAssignment>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    private readonly deviceManagementHikvisionService: DeviceManagementHikvisionService,
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
      vendor_name: item.vendorName,
      integration_type: item.integrationType,
      auth_type: item.authType,
      api_username: item.apiUsername,
      sync_mode: item.syncMode,
      status: item.status,
      is_active: item.isActive,
      last_sync_at: item.lastSyncAt,
      last_heartbeat_at: item.lastHeartbeatAt,
      last_listener_at: item.lastListenerAt,
      firmware_version: item.firmwareVersion,
      mac_address: item.macAddress,
      device_type: item.deviceType,
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
        vendorName: dto.vendor_name?.trim() || null,
        integrationType: dto.integration_type?.trim() || 'generic',
        authType: dto.auth_type?.trim() || 'none',
        apiUsername: dto.api_username.trim(),
        apiPassword: dto.api_password,
        syncMode: dto.sync_mode,
        status: dto.status,
        isActive: dto.is_active ?? true,
        firmwareVersion: dto.firmware_version?.trim() || null,
        macAddress: dto.mac_address?.trim() || null,
        deviceType: dto.device_type?.trim() || null,
        timezone: dto.timezone.trim(),
        locationDescription: dto.location_description?.trim() || null,
        metadata: dto.metadata ?? null,
      }),
    );

    if (this.shouldAutoSyncHikvision(created)) {
      try {
        await this.deviceManagementHikvisionService.syncDevice(companyId, created.id);
      } catch (error) {
        await this.attendanceDeviceRepository.softRemove(created);
        throw new BadRequestException(
          `Hikvision sync failed during create. Device creation was rolled back. ${this.extractSyncErrorMessage(error)}`,
        );
      }
    }

    const finalCreated = await this.findOrFail(companyId, created.id);
    return this.map(finalCreated);
  }

  async findAll(companyId: number, query: AttendanceDeviceQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      status,
      branch_id,
      vendor_name,
      integration_type,
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

    if (vendor_name?.trim()) {
      qb.andWhere('LOWER(attendanceDevice.vendor_name) LIKE :vendor', {
        vendor: `%${vendor_name.trim().toLowerCase()}%`,
      });
    }

    if (integration_type?.trim()) {
      qb.andWhere('LOWER(attendanceDevice.integration_type) = :integrationType', {
        integrationType: integration_type.trim().toLowerCase(),
      });
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
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      device_name: 'deviceName',
      status: 'status',
      last_sync_at: 'lastSyncAt',
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

  async findDeviceEmployees(
    companyId: number,
    deviceId: number,
    query: AttendanceDeviceEmployeesQueryDto,
  ) {
    await this.findOrFail(companyId, deviceId);

    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      search,
      sync_status,
    } = query;

    const qb = this.employeeDeviceAssignmentRepository
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.employee', 'employee')
      .where('assignment.device_id = :deviceId', { deviceId })
      .andWhere('assignment.company_id = :companyId', { companyId });

    if (sync_status) {
      qb.andWhere('assignment.sync_status = :syncStatus', { syncStatus: sync_status });
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        `(
          assignment.employee_no LIKE :term
          OR employee.first_name LIKE :term
          OR employee.last_name LIKE :term
          OR CONCAT(COALESCE(employee.first_name, ''), ' ', COALESCE(employee.last_name, '')) LIKE :term
        )`,
        { term },
      );
    }

    const allowedSortFields = [
      'created_at',
      'updated_at',
      'employee_no',
      'sync_status',
      'last_synced_at',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const sortFieldMap: Record<string, string> = {
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      employee_no: 'employeeNo',
      sync_status: 'syncStatus',
      last_synced_at: 'lastSyncedAt',
    };

    const [items, total] = await qb
      .orderBy(`assignment.${sortFieldMap[safeSortBy]}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      device_id: deviceId,
      data: items.map((item) => this.mapDeviceEmployeeAssignment(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async update(companyId: number, id: number, dto: UpdateAttendanceDeviceDto) {
    const item = await this.findOrFail(companyId, id);
    const snapshotBeforeUpdate = this.captureDeviceSnapshot(item);

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
    if (dto.vendor_name !== undefined) item.vendorName = dto.vendor_name?.trim() || null;
    if (dto.integration_type !== undefined) item.integrationType = dto.integration_type.trim();
    if (dto.auth_type !== undefined) item.authType = dto.auth_type.trim();
    if (dto.api_username !== undefined) item.apiUsername = dto.api_username.trim();
    if (dto.api_password !== undefined) item.apiPassword = dto.api_password;
    if (dto.sync_mode !== undefined) item.syncMode = dto.sync_mode;
    if (dto.status !== undefined) item.status = dto.status;
    if (dto.is_active !== undefined) item.isActive = dto.is_active;
    if (dto.firmware_version !== undefined)
      item.firmwareVersion = dto.firmware_version?.trim() || null;
    if (dto.mac_address !== undefined) item.macAddress = dto.mac_address?.trim() || null;
    if (dto.device_type !== undefined) item.deviceType = dto.device_type?.trim() || null;
    if (dto.timezone !== undefined) item.timezone = dto.timezone.trim();
    if (dto.location_description !== undefined)
      item.locationDescription = dto.location_description?.trim() || null;
    if (dto.metadata !== undefined) item.metadata = dto.metadata;

    const saved = await this.attendanceDeviceRepository.save(item);

    if (this.shouldAutoSyncHikvision(saved)) {
      try {
        await this.deviceManagementHikvisionService.syncDevice(companyId, saved.id);
      } catch (error) {
        const restored = this.attendanceDeviceRepository.create(snapshotBeforeUpdate);
        await this.attendanceDeviceRepository.save(restored);
        throw new BadRequestException(
          `Hikvision sync failed during update. Backend values were restored. ${this.extractSyncErrorMessage(error)}`,
        );
      }
    }

    const finalUpdated = await this.findOrFail(companyId, saved.id);
    return this.map(finalUpdated);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.attendanceDeviceRepository.softRemove(item);
    return { message: 'Attendance device deleted successfully' };
  }

  async syncDeviceData(companyId: number, id: number) {
    const item = await this.findOrFail(companyId, id);
    if (!this.shouldAutoSyncHikvision(item)) {
      throw new BadRequestException(
        'Manual sync is currently supported only for Hikvision devices',
      );
    }

    const syncResult = await this.deviceManagementHikvisionService.syncDevice(companyId, id);
    const refreshed = await this.findOrFail(companyId, id);

    return {
      message: 'Attendance device manual sync completed successfully',
      synced_fields: syncResult.synced_fields ?? [],
      device: this.map(refreshed),
    };
  }

  private mapDeviceEmployeeAssignment(item: EmployeeDeviceAssignment) {
    const employeeName =
      [item.employee?.first_name, item.employee?.last_name]
        .filter((value) => Boolean(value))
        .join(' ')
        .trim() || null;

    return {
      id: item.id,
      company_id: item.companyId,
      device_id: item.deviceId,
      employee_id: item.employeeId,
      employee_no: item.employeeNo,
      employee_name: employeeName,
      hikvision_user_type: item.hikvisionUserType,
      user_verify_mode: item.userVerifyMode,
      valid_begin_time: item.validBeginTime,
      valid_end_time: item.validEndTime,
      valid_enabled: item.validEnabled,
      door_right: item.doorRight,
      sync_status: item.syncStatus,
      last_synced_at: item.lastSyncedAt,
      metadata: item.metadata,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      deleted_at: item.deletedAt,
    };
  }

  private shouldAutoSyncHikvision(
    device: Pick<AttendanceDevice, 'integrationType' | 'vendorName' | 'authType'>,
  ): boolean {
    const integrationType = (device.integrationType || '').trim().toLowerCase();
    const vendorName = (device.vendorName || '').trim().toLowerCase();
    const isHikvision = integrationType === 'hikvision' || vendorName.includes('hikvision');
    return isHikvision;
  }

  private extractSyncErrorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (response && typeof response === 'object') {
        const message = (response as { message?: unknown }).message;
        if (Array.isArray(message)) {
          return message.join(', ');
        }
        if (typeof message === 'string') {
          return message;
        }
      }
      return error.message;
    }

    return (error as { message?: string } | null)?.message || 'Unknown sync error';
  }

  private captureDeviceSnapshot(device: AttendanceDevice): AttendanceDevice {
    return this.attendanceDeviceRepository.create({
      id: device.id,
      companyId: device.companyId,
      branchId: device.branchId,
      deviceName: device.deviceName,
      deviceCode: device.deviceCode,
      deviceSerialNumber: device.deviceSerialNumber,
      deviceModel: device.deviceModel,
      ipAddress: device.ipAddress,
      port: device.port,
      protocol: device.protocol,
      vendorName: device.vendorName,
      integrationType: device.integrationType,
      authType: device.authType,
      apiUsername: device.apiUsername,
      apiPassword: device.apiPassword,
      syncMode: device.syncMode,
      status: device.status,
      isActive: device.isActive,
      lastSyncAt: device.lastSyncAt,
      lastHeartbeatAt: device.lastHeartbeatAt,
      lastListenerAt: device.lastListenerAt,
      firmwareVersion: device.firmwareVersion,
      macAddress: device.macAddress,
      deviceType: device.deviceType,
      timezone: device.timezone,
      locationDescription: device.locationDescription,
      metadata: device.metadata,
      deletedAt: device.deletedAt,
    });
  }
}






