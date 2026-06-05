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
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { HikvisionService as DeviceManagementHikvisionService } from '../../../hikvision/hikvision.service';
import { Branch } from '../../../hr/branches/entities/branch.entity';
import { buildPaginationMeta } from '../../../hr/shared/hr.utils';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { EmployeeDeviceAssignment } from '../../employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentMatchQueryDto } from '../dto/employee-device-assignment-match-query.dto';
import { AttendanceDeviceEmployeesQueryDto } from '../dtos/attendance-device-employees-query.dto';
import { AttendanceDeviceQueryDto } from '../dtos/attendance-device-query.dto';
import { CreateAttendanceDeviceDto } from '../dtos/create-attendance-device.dto';
import { UpdateAttendanceDeviceDto } from '../dtos/update-attendance-device.dto';
import { AttendanceDevice } from '../entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../enums/attendance-device-status.enum';

type MatchCandidate = {
  id: number;
  employee_name: string | null;
  employee_no: string;
};

type EmployeeNameSource = Pick<
  Employee,
  'first_name' | 'middle_name' | 'last_name' | 'preferred_name'
>;

@Injectable()
export class AccessControlAttendanceDevicesService {
  constructor(
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly employeeDeviceAssignmentRepository: Repository<EmployeeDeviceAssignment>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    private readonly deviceManagementHikvisionService: DeviceManagementHikvisionService,
  ) {}

  async create(companyId: number, dto: CreateAttendanceDeviceDto) {
    await this.ensureBranch(companyId, dto.branch_id);

    const normalizedDeviceCode = await this.resolveDeviceCode(companyId, dto.device_code);
    const resolvedStatus = this.resolveDeviceStatus(dto.status);

    const created = await this.attendanceDeviceRepository.save(
      this.attendanceDeviceRepository.create({
        companyId,
        branchId: dto.branch_id ?? null,
        deviceName: this.resolveDeviceName(dto.device_name, normalizedDeviceCode),
        deviceCode: normalizedDeviceCode,
        deviceSerialNumber: dto.device_serial_number?.trim() || null,
        deviceModel: dto.device_model?.trim() || null,
        ipAddress: this.resolveIpAddress(dto.ip_address),
        port: dto.port ?? null,
        protocol: dto.protocol?.trim() || null,
        vendorName: dto.vendor_name?.trim() || null,
        integrationType: dto.integration_type?.trim() || 'generic',
        authType: this.resolveAuthType(dto.auth_type),
        apiUsername: dto.api_username.trim(),
        apiPassword: dto.api_password,
        syncMode: dto.sync_mode,
        status: resolvedStatus,
        firmwareVersion: dto.firmware_version?.trim() || null,
        macAddress: dto.mac_address?.trim() || null,
        deviceType: dto.device_type?.trim() || null,
        timezone: dto.timezone?.trim() || null,
        locationDescription: dto.location_description?.trim() || null,
        metadata: dto.metadata ?? null,
      }),
    );

    if (this.shouldAutoSyncHikvision(created)) {
      try {
        await this.deviceManagementHikvisionService.syncDevice(companyId, created.id);
      } catch (error) {
        await this.attendanceDeviceRepository.delete(created.id);
        throw new BadRequestException(
          `Hikvision sync failed during create. Device creation was rolled back. ${this.extractSyncErrorMessage(error)}`,
        );
      }
    }

    const finalCreated = await this.findOrFail(companyId, created.id);
    return this.mapDevice(finalCreated);
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
      data: items.map((item) => this.mapDevice(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, id: number) {
    return this.mapDevice(await this.findOrFail(companyId, id));
  }

  async findDeviceEmployees(
    companyId: number,
    deviceId: number,
    query: AttendanceDeviceEmployeesQueryDto,
  ) {
    await this.ensureDeviceExistsInDatabase(companyId, deviceId);

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
      item.deviceCode = await this.resolveDeviceCode(companyId, dto.device_code, item.id);
    }

    if (dto.device_name !== undefined) {
      item.deviceName = this.resolveDeviceName(dto.device_name, item.deviceCode);
    }
    if (dto.device_serial_number !== undefined) {
      item.deviceSerialNumber = dto.device_serial_number?.trim() || null;
    }
    if (dto.device_model !== undefined) {
      item.deviceModel = dto.device_model?.trim() || null;
    }
    if (dto.ip_address !== undefined) {
      item.ipAddress = this.resolveIpAddress(dto.ip_address);
    }
    if (dto.port !== undefined) {
      item.port = dto.port ?? null;
    }
    if (dto.protocol !== undefined) {
      item.protocol = dto.protocol?.trim() || null;
    }
    if (dto.vendor_name !== undefined) {
      item.vendorName = dto.vendor_name?.trim() || null;
    }
    if (dto.integration_type !== undefined) {
      item.integrationType = dto.integration_type?.trim() || 'generic';
    }
    if (dto.auth_type !== undefined) {
      item.authType = this.resolveAuthType(dto.auth_type);
    }
    if (dto.api_username !== undefined) {
      item.apiUsername = dto.api_username.trim();
    }
    if (dto.api_password !== undefined) {
      item.apiPassword = dto.api_password;
    }
    if (dto.sync_mode !== undefined) {
      item.syncMode = dto.sync_mode;
    }
    if (dto.status !== undefined) {
      item.status = this.resolveDeviceStatus(dto.status);
    }
    if (dto.firmware_version !== undefined) {
      item.firmwareVersion = dto.firmware_version?.trim() || null;
    }
    if (dto.mac_address !== undefined) {
      item.macAddress = dto.mac_address?.trim() || null;
    }
    if (dto.device_type !== undefined) {
      item.deviceType = dto.device_type?.trim() || null;
    }
    if (dto.timezone !== undefined) {
      item.timezone = dto.timezone?.trim() || null;
    }
    if (dto.location_description !== undefined) {
      item.locationDescription = dto.location_description?.trim() || null;
    }
    if (dto.metadata !== undefined) {
      item.metadata = dto.metadata;
    }

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
    return this.mapDevice(finalUpdated);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.attendanceDeviceRepository.delete(item.id);
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
      device: this.mapDevice(refreshed),
    };
  }

  async searchEmployeeDeviceAssignmentMatches(
    companyId: number,
    query: EmployeeDeviceAssignmentMatchQueryDto,
  ): Promise<MatchCandidate[]> {
    await this.ensureDeviceExistsInDatabase(companyId, query.deviceId);
    const employee = await this.findEmployeeOrFail(companyId, query.employeeId);
    const nameVariations = this.buildEmployeeNameVariations(employee);

    if (!nameVariations.length) {
      return [];
    }

    const assignments = await this.employeeDeviceAssignmentRepository
      .createQueryBuilder('assignment')
      .select('assignment.id', 'id')
      .addSelect('assignment.employee_name', 'employee_name')
      .addSelect('assignment.employee_no', 'employee_no')
      .where('assignment.company_id = :companyId', { companyId })
      .andWhere('assignment.device_id = :deviceId', { deviceId: query.deviceId })
      .andWhere('assignment.employee_id IS NULL')
      .andWhere('assignment.employee_name IS NOT NULL')
      .getRawMany<MatchCandidate>();

    return assignments
      .map((assignment) => ({
        assignment,
        score: this.calculateMatchScore(assignment.employee_name, nameVariations),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        const leftName = left.assignment.employee_name ?? '';
        const rightName = right.assignment.employee_name ?? '';
        return (
          leftName.localeCompare(rightName)
          || left.assignment.employee_no.localeCompare(right.assignment.employee_no)
        );
      })
      .map(({ assignment }) => ({
        id: Number(assignment.id),
        employee_name: assignment.employee_name,
        employee_no: assignment.employee_no,
      }));
  }

  private mapDevice(item: AttendanceDevice) {
    const hikvisionMetadata = this.toObject(this.toObject(item.metadata).hikvision);

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
      last_sync_at: item.lastSyncAt,
      last_heartbeat_at: item.lastHeartbeatAt,
      last_listener_at: item.lastListenerAt,
      firmware_version: item.firmwareVersion,
      mac_address: item.macAddress,
      device_type: item.deviceType,
      timezone: item.timezone,
      location_description: item.locationDescription,
      supported_user_verify_modes: Array.isArray(hikvisionMetadata.supported_user_verify_modes)
        ? hikvisionMetadata.supported_user_verify_modes
        : [],
      metadata: item.metadata,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      deleted_at: item.deletedAt,
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

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private async findOrFail(companyId: number, id: number): Promise<AttendanceDevice> {
    const item = await this.attendanceDeviceRepository.findOne({ where: { id, companyId } });
    if (!item) {
      throw new NotFoundException('Attendance device not found');
    }
    return item;
  }

  private async ensureDeviceExistsInDatabase(companyId: number, deviceId: number): Promise<void> {
    const exists = await this.attendanceDeviceRepository.exists({
      where: { id: deviceId, companyId },
    });

    if (!exists) {
      throw new NotFoundException('Attendance device not found');
    }
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

  private async findEmployeeOrFail(
    companyId: number,
    employeeId: number,
  ): Promise<EmployeeNameSource> {
    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin(CompanyUser, 'companyUser', 'companyUser.id = employee.company_user_id')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .select([
        'employee.first_name',
        'employee.middle_name',
        'employee.last_name',
        'employee.preferred_name',
      ])
      .getOne();

    if (!employee) {
      throw new NotFoundException('Employee not found for active company');
    }

    return employee;
  }

  private buildEmployeeNameVariations(employee: EmployeeNameSource): string[] {
    const firstName = this.normalizeName(employee.first_name);
    const middleName = this.normalizeName(employee.middle_name);
    const lastName = this.normalizeName(employee.last_name);
    const preferredName = this.normalizeName(employee.preferred_name);
    const variations = new Set<string>();

    this.addNameVariation(variations, firstName, lastName);
    this.addNameVariation(variations, firstName, middleName, lastName);
    this.addNameVariation(variations, preferredName, lastName);
    this.addNameVariation(variations, preferredName, middleName, lastName);
    this.addNameVariation(variations, preferredName);
    this.addNameVariation(variations, firstName, middleName);
    this.addNameVariation(variations, firstName);

    return [...variations].sort((left, right) => right.length - left.length);
  }

  private addNameVariation(variations: Set<string>, ...parts: Array<string | null>): void {
    const value = parts.filter((part): part is string => Boolean(part)).join(' ').trim();
    if (value) {
      variations.add(value);
    }
  }

  private calculateMatchScore(
    assignmentEmployeeName: string | null,
    nameVariations: string[],
  ): number {
    const candidate = this.normalizeName(assignmentEmployeeName);

    if (!candidate) {
      return 0;
    }

    const candidateTokens = candidate.split(' ').filter(Boolean);
    const candidateTokenSet = new Set(candidateTokens);
    let bestScore = 0;

    for (const variation of nameVariations) {
      const variationTokens = variation.split(' ').filter(Boolean);
      const sharedTokenCount = variationTokens.filter((token) => candidateTokenSet.has(token)).length;

      if (candidate === variation) {
        bestScore = Math.max(bestScore, 100 + variationTokens.length);
        continue;
      }

      if (
        variationTokens.length >= 2
        && (candidate.includes(variation) || variation.includes(candidate))
      ) {
        bestScore = Math.max(bestScore, 85 + sharedTokenCount);
        continue;
      }

      if (variationTokens.length >= 2 && sharedTokenCount === variationTokens.length) {
        bestScore = Math.max(bestScore, 75 + sharedTokenCount);
        continue;
      }

      const variationCoverage = sharedTokenCount / variationTokens.length;
      const candidateCoverage = sharedTokenCount / candidateTokens.length;
      if (
        sharedTokenCount >= 2
        && (variationCoverage >= 0.5 || candidateCoverage >= 0.5)
      ) {
        bestScore = Math.max(bestScore, 60 + sharedTokenCount);
        continue;
      }

      if (
        variationTokens.length === 1
        && variation.length >= 3
        && candidateTokenSet.has(variation)
      ) {
        bestScore = Math.max(bestScore, 40 + variation.length);
      }
    }

    return bestScore;
  }

  private normalizeName(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalized = value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');

    return normalized || null;
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

  private async resolveDeviceCode(
    companyId: number,
    preferredCode?: string | null,
    currentId?: number,
  ): Promise<string> {
    if (preferredCode?.trim()) {
      const normalized = preferredCode.trim();
      const existing = await this.attendanceDeviceRepository.findOne({
        where: { deviceCode: normalized },
        select: ['id'],
        withDeleted: true,
      });

      if (existing && existing.id !== currentId) {
        throw new ConflictException('device_code already exists');
      }

      return normalized;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `ATD-${companyId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const existing = await this.attendanceDeviceRepository.findOne({
        where: { deviceCode: candidate },
        select: ['id'],
        withDeleted: true,
      });

      if (!existing || existing.id === currentId) {
        return candidate;
      }
    }

    throw new ConflictException('Could not generate a unique device_code, please provide one');
  }

  private resolveDeviceName(value: string | null | undefined, deviceCode: string): string {
    const normalized = value?.trim();
    return normalized || `Attendance Device ${deviceCode}`;
  }

  private resolveIpAddress(value: string | null | undefined): string {
    return value?.trim() || '0.0.0.0';
  }

  private resolveAuthType(value: string | null | undefined): string {
    return value?.trim() || 'none';
  }

  private resolveDeviceStatus(
    value: AttendanceDeviceStatusEnum | null | undefined,
  ): AttendanceDeviceStatusEnum {
    return value ?? AttendanceDeviceStatusEnum.INACTIVE;
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
