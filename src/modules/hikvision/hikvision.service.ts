import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../hr/branches/entities/branch.entity';
import { AttendanceDevice } from '../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../access-control/attendance-devices/enums/attendance-device-status.enum';
import { AttendanceDeviceSyncModeEnum } from '../access-control/attendance-devices/enums/attendance-device-sync-mode.enum';
import { CreateHikvisionDeviceDto } from './dto/create-hikvision-device.dto';
import { HikvisionDeviceQueryDto } from './dto/hikvision-device-query.dto';
import { SyncAllHikvisionDevicesDto } from './dto/sync-all-hikvision-devices.dto';
import { UpdateHikvisionDeviceDto } from './dto/update-hikvision-device.dto';
import { HikvisionDigestClient } from './helpers/hikvision-digest.client';
import { normalizeHikvisionError } from './helpers/hikvision-error.helper';
import { HikvisionParserHelper } from './helpers/hikvision-parser.helper';
import { HikvisionConnectionCredentials } from './interfaces/hikvision-client.interface';
import {
  HikvisionMappedDeviceFields,
  HikvisionSyncSnapshot,
} from './interfaces/hikvision-sync.interface';

type ParsedConnectionTarget = {
  ipAddress: string;
  port?: number;
  protocol?: string;
};

@Injectable()
export class HikvisionService {
  private readonly logger = new Logger(HikvisionService.name);
  private readonly integrationType = 'hikvision';
  private readonly vendorName = 'Hikvision';
  private readonly authType = 'digest';

  constructor(
    @InjectRepository(AttendanceDevice)
    private readonly deviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    private readonly configService: ConfigService,
    private readonly digestClient: HikvisionDigestClient,
    private readonly parserHelper: HikvisionParserHelper,
  ) {}

  async createDevice(companyId: number, dto: CreateHikvisionDeviceDto) {
    await this.ensureBranch(companyId, dto.branch_id);

    const target = this.normalizeConnectionTarget(dto.ip_address, dto.port, dto.protocol);
    const timezone = dto.timezone?.trim() || this.resolveTimezoneDefault();
    await this.ensureIpPortUnique(companyId, target.ipAddress, target.port);

    const snapshot = await this.fetchSnapshot({
      ipAddress: target.ipAddress,
      port: target.port,
      protocol: target.protocol,
      username: dto.username.trim(),
      password: dto.password,
    });
    const deviceCode = await this.resolveDeviceCode(
      companyId,
      dto.device_code ?? snapshot.mappedFields.deviceCode,
    );

    const entity = this.deviceRepository.create({
      companyId,
      branchId: dto.branch_id ?? null,
      deviceName: dto.device_name?.trim() || snapshot.mappedFields.deviceName || 'Hikvision Device',
      deviceCode,
      deviceSerialNumber:
        snapshot.mappedFields.deviceSerialNumber || `HIK-SN-${Date.now()}`,
      deviceModel: snapshot.mappedFields.deviceModel || 'Unknown Model',
      ipAddress: target.ipAddress,
      port: target.port,
      protocol: target.protocol,
      vendorName: snapshot.mappedFields.vendorName || this.vendorName,
      integrationType: this.integrationType,
      authType: this.authType,
      apiUsername: dto.username.trim(),
      apiPassword: dto.password,
      syncMode: AttendanceDeviceSyncModeEnum.PULL,
      status: dto.status ?? AttendanceDeviceStatusEnum.ACTIVE,
      lastSyncAt: new Date(),
      firmwareVersion: snapshot.mappedFields.firmwareVersion || null,
      macAddress: snapshot.mappedFields.macAddress || null,
      deviceType: snapshot.mappedFields.deviceType || 'unknown',
      timezone,
      locationDescription: dto.location_description?.trim() || null,
      metadata: this.buildMergedMetadata(null, snapshot, dto.metadata ?? null),
    });

    const created = await this.deviceRepository.save(entity);
    return {
      message: 'Hikvision device created and synced successfully',
      device: this.mapDevice(created),
      synced_fields: this.getMappedFieldKeys(snapshot.mappedFields),
    };
  }

  async updateDevice(companyId: number, id: number, dto: UpdateHikvisionDeviceDto) {
    const device = await this.findHikvisionDeviceOrFail(companyId, id);

    if (dto.branch_id !== undefined) {
      await this.ensureBranch(companyId, dto.branch_id);
      device.branchId = dto.branch_id ?? null;
    }

    if (dto.device_code !== undefined) {
      device.deviceCode = await this.resolveDeviceCode(companyId, dto.device_code, device.id);
    }

    if (dto.device_name !== undefined) device.deviceName = dto.device_name.trim();
    if (dto.username !== undefined) device.apiUsername = dto.username.trim();
    if (dto.password !== undefined) device.apiPassword = dto.password;
    if (dto.status !== undefined) device.status = dto.status;
    if (dto.timezone !== undefined) device.timezone = dto.timezone.trim();
    if (dto.location_description !== undefined) {
      device.locationDescription = dto.location_description?.trim() || null;
    }
    if (dto.metadata !== undefined) {
      device.metadata = this.mergeBackendMetadata(device.metadata, dto.metadata);
    }

    if (dto.ip_address !== undefined || dto.port !== undefined || dto.protocol !== undefined) {
      const currentIpAddress = device.ipAddress;

      if (!dto.ip_address && !currentIpAddress) {
        throw new BadRequestException('ip_address is required before updating connection settings');
      }

      const target = this.normalizeConnectionTarget(
        dto.ip_address ?? currentIpAddress!,
        dto.port ?? device.port,
        dto.protocol ?? device.protocol,
      );
      device.ipAddress = target.ipAddress;
      device.port = target.port;
      device.protocol = target.protocol;
      await this.ensureIpPortUnique(companyId, device.ipAddress, device.port, device.id);
    }

    const updated = await this.deviceRepository.save(device);
    if (!dto.sync_now) {
      return {
        message: 'Hikvision device updated successfully',
        device: this.mapDevice(updated),
      };
    }

    const syncResult = await this.syncDevice(companyId, updated.id);
    return {
      message: 'Hikvision device updated and synced successfully',
      device: syncResult.device,
      synced_fields: syncResult.synced_fields,
    };
  }

  async deleteDevice(companyId: number, id: number): Promise<{ message: string }> {
    const device = await this.findHikvisionDeviceOrFail(companyId, id);
    await this.deviceRepository.softRemove(device);
    return { message: 'Hikvision device deleted successfully' };
  }

  async listDevices(companyId: number, query: HikvisionDeviceQueryDto) {
    const qb = this.deviceRepository
      .createQueryBuilder('device')
      .where('device.company_id = :companyId', { companyId })
      .andWhere(
        '(LOWER(device.integration_type) = :integrationType OR LOWER(COALESCE(device.vendor_name, \'\')) LIKE :vendor)',
        {
          integrationType: this.integrationType,
          vendor: '%hikvision%',
        },
      );

    if (query.branch_id) {
      qb.andWhere('device.branch_id = :branchId', { branchId: query.branch_id });
    }

    if (query.status !== undefined) {
      qb.andWhere('device.status = :status', { status: query.status });
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(device.device_name LIKE :term OR device.device_code LIKE :term OR device.device_serial_number LIKE :term OR device.ip_address LIKE :term)',
        { term },
      );
    }

    const devices = await qb.orderBy('device.created_at', 'DESC').getMany();
    return devices.map((item) => this.mapDevice(item));
  }

  async getDevice(companyId: number, id: number) {
    const device = await this.findHikvisionDeviceOrFail(companyId, id);
    return this.mapDevice(device);
  }

  async testDeviceConnection(companyId: number, id: number) {
    const device = await this.findHikvisionDeviceOrFail(companyId, id);
    const credentials = this.buildCredentialsFromDevice(device);
    const startedAt = Date.now();

    try {
      const [deviceInfoResponse, capabilitiesResponse] = await Promise.all([
        this.digestClient.request(credentials, '/ISAPI/System/deviceInfo', {
          headers: { Accept: 'application/json, application/xml' },
        }),
        this.digestClient.request(credentials, '/ISAPI/AccessControl/capabilities', {
          headers: { Accept: 'application/json, application/xml' },
        }),
      ]);

      if (!deviceInfoResponse.ok) {
        throw this.buildFailedEndpointException(
          '/ISAPI/System/deviceInfo',
          deviceInfoResponse.status,
          deviceInfoResponse.body,
        );
      }

      if (!capabilitiesResponse.ok) {
        throw this.buildFailedEndpointException(
          '/ISAPI/AccessControl/capabilities',
          capabilitiesResponse.status,
          capabilitiesResponse.body,
        );
      }

      await this.deviceRepository.update(device.id, { lastHeartbeatAt: new Date() });
      return {
        success: true,
        message: 'Hikvision device connection test succeeded',
        latency_ms: Date.now() - startedAt,
      };
    } catch (error) {
      throw normalizeHikvisionError(error);
    }
  }

  async syncDevice(companyId: number, id: number) {
    const device = await this.findHikvisionDeviceOrFail(companyId, id);
    try {
      const snapshot = await this.fetchSnapshot(this.buildCredentialsFromDevice(device));
      const syncedFields = await this.applySafeMappedFields(device, snapshot.mappedFields);
      device.lastSyncAt = new Date();
      device.vendorName = this.vendorName;
      device.integrationType = this.integrationType;
      device.authType = this.authType;
      device.metadata = this.buildMergedMetadata(device.metadata, snapshot, null);

      const saved = await this.deviceRepository.save(device);
      return {
        message: 'Hikvision device synced successfully',
        device: this.mapDevice(saved),
        synced_fields: syncedFields,
      };
    } catch (error) {
      this.logger.error(
        `Sync failed for Hikvision device ${device.id}: ${(error as Error).message}`,
      );
      throw normalizeHikvisionError(error);
    }
  }

  async syncAllDevices(companyId: number, dto: SyncAllHikvisionDevicesDto) {
    const devices = await this.findAllHikvisionDevices(companyId, dto);
    const continueOnError = dto.continue_on_error ?? true;
    const results: Array<{
      device_id: number;
      success: boolean;
      message: string;
      synced_fields?: string[];
    }> = [];

    for (const device of devices) {
      try {
        const snapshot = await this.fetchSnapshot(this.buildCredentialsFromDevice(device));
        const syncedFields = await this.applySafeMappedFields(device, snapshot.mappedFields);
        device.lastSyncAt = new Date();
        device.vendorName = this.vendorName;
        device.integrationType = this.integrationType;
        device.authType = this.authType;
        device.metadata = this.buildMergedMetadata(device.metadata, snapshot, null);
        await this.deviceRepository.save(device);

        results.push({
          device_id: device.id,
          success: true,
          message: 'Synced',
          synced_fields: syncedFields,
        });
      } catch (error) {
        const normalized = normalizeHikvisionError(error);
        results.push({
          device_id: device.id,
          success: false,
          message: normalized.message,
        });

        if (!continueOnError) {
          throw normalized;
        }
      }
    }

    const successCount = results.filter((item) => item.success).length;
    const failureCount = results.length - successCount;

    return {
      message: 'Hikvision sync-all completed',
      total_devices: results.length,
      success_count: successCount,
      failure_count: failureCount,
      results,
    };
  }

  private async fetchSnapshot(
    credentials: HikvisionConnectionCredentials,
  ): Promise<HikvisionSyncSnapshot> {
    const [deviceInfoResponse, capabilitiesResponse] = await Promise.all([
      this.digestClient.request(credentials, '/ISAPI/System/deviceInfo', {
        headers: { Accept: 'application/json, application/xml' },
      }),
      this.digestClient.request(credentials, '/ISAPI/AccessControl/capabilities', {
        headers: { Accept: 'application/json, application/xml' },
      }),
    ]);

    if (!deviceInfoResponse.ok) {
      throw this.buildFailedEndpointException(
        '/ISAPI/System/deviceInfo',
        deviceInfoResponse.status,
        deviceInfoResponse.body,
      );
    }

    if (!capabilitiesResponse.ok) {
      throw this.buildFailedEndpointException(
        '/ISAPI/AccessControl/capabilities',
        capabilitiesResponse.status,
        capabilitiesResponse.body,
      );
    }

    const parsedDeviceInfo = this.parserHelper.parsePayload(deviceInfoResponse.body);
    const parsedCapabilities = this.parserHelper.parsePayload(capabilitiesResponse.body);
    const deviceInfoRoot = this.extractFirstExistingRoot(parsedDeviceInfo, ['DeviceInfo']);
    const capabilitiesRoot = this.extractFirstExistingRoot(parsedCapabilities, [
      'AccessControl',
      'AccessControlCapability',
    ]);
    const mappedFields = this.extractMappedFields(deviceInfoRoot, capabilitiesRoot);
    const mappedSourceKeys = this.getMappedSourceKeys();
    const supportedUserVerifyModes = this.extractSupportedUserVerifyModes(capabilitiesRoot);

    return {
      deviceInfo: deviceInfoRoot,
      accessControlCapabilities: capabilitiesRoot,
      mappedFields,
      supportedUserVerifyModes,
      metadataExtras: {
        device_info: this.stripMappedKeysDeep(deviceInfoRoot, mappedSourceKeys),
        access_control_capabilities: this.stripMappedKeysDeep(capabilitiesRoot, mappedSourceKeys),
      },
    };
  }

  private extractMappedFields(
    deviceInfo: Record<string, unknown>,
    capabilities: Record<string, unknown>,
  ): HikvisionMappedDeviceFields {
    const read = (keys: string[]) =>
      this.parserHelper.findFirstStringDeep(deviceInfo, keys) ||
      this.parserHelper.findFirstStringDeep(capabilities, keys);

    return {
      deviceCode: read(['deviceID', 'deviceId']),
      deviceName: read(['deviceName', 'name']),
      deviceSerialNumber: read(['serialNumber']),
      deviceModel: read(['model']),
      firmwareVersion: read(['firmwareVersion']),
      macAddress: read(['macAddress']),
      deviceType: read(['deviceType', 'deviceDescription']),
      timezone: read(['timeZone', 'timezone']),
      vendorName: read(['manufacturer', 'vendorName']) || this.vendorName,
    };
  }

  private async applySafeMappedFields(
    device: AttendanceDevice,
    mappedFields: HikvisionMappedDeviceFields,
  ): Promise<string[]> {
    const syncedFields: string[] = [];

    const assignments: Array<{
      key: keyof HikvisionMappedDeviceFields;
      getCurrent: () => string | null | undefined;
      setCurrent: (value: string) => Promise<boolean>;
      label: string;
    }> = [
      {
        key: 'deviceCode',
        getCurrent: () => device.deviceCode,
        setCurrent: async (value: string) => this.trySetDeviceCode(device, value),
        label: 'device_code',
      },
      {
        key: 'deviceName',
        getCurrent: () => device.deviceName,
        setCurrent: async (value: string) => {
          device.deviceName = value;
          return true;
        },
        label: 'device_name',
      },
      {
        key: 'deviceSerialNumber',
        getCurrent: () => device.deviceSerialNumber,
        setCurrent: async (value: string) => {
          device.deviceSerialNumber = value;
          return true;
        },
        label: 'device_serial_number',
      },
      {
        key: 'deviceModel',
        getCurrent: () => device.deviceModel,
        setCurrent: async (value: string) => {
          device.deviceModel = value;
          return true;
        },
        label: 'device_model',
      },
      {
        key: 'firmwareVersion',
        getCurrent: () => device.firmwareVersion,
        setCurrent: async (value: string) => {
          device.firmwareVersion = value;
          return true;
        },
        label: 'firmware_version',
      },
      {
        key: 'macAddress',
        getCurrent: () => device.macAddress,
        setCurrent: async (value: string) => {
          device.macAddress = value;
          return true;
        },
        label: 'mac_address',
      },
      {
        key: 'deviceType',
        getCurrent: () => device.deviceType,
        setCurrent: async (value: string) => {
          device.deviceType = value;
          return true;
        },
        label: 'device_type',
      },
      {
        key: 'timezone',
        getCurrent: () => device.timezone,
        setCurrent: async (value: string) => {
          device.timezone = value;
          return true;
        },
        label: 'timezone',
      },
      {
        key: 'vendorName',
        getCurrent: () => device.vendorName,
        setCurrent: async (value: string) => {
          device.vendorName = value;
          return true;
        },
        label: 'vendor_name',
      },
    ];

    for (const assignment of assignments) {
      const incoming = mappedFields[assignment.key]?.trim();
      if (!incoming) {
        continue;
      }

      const currentValue = assignment.getCurrent()?.trim() || '';
      if (currentValue !== incoming) {
        const changed = await assignment.setCurrent(incoming);
        if (changed) {
          syncedFields.push(assignment.label);
        }
      }
    }

    return syncedFields;
  }

  private buildMergedMetadata(
    existingMetadata: Record<string, unknown> | null,
    snapshot: HikvisionSyncSnapshot,
    createMetadata: Record<string, unknown> | null,
  ): Record<string, unknown> {
    const safeExisting = this.toObject(existingMetadata);
    const safeCreate = this.toObject(createMetadata);
    const existingHikvision = this.sanitizeHikvisionMetadata(this.toObject(safeExisting.hikvision));

    return {
      ...safeExisting,
      ...safeCreate,
      hikvision: {
        ...existingHikvision,
        last_synced_at: new Date().toISOString(),
        supported_user_verify_modes: snapshot.supportedUserVerifyModes,
        metadata_extras: snapshot.metadataExtras,
        mapped_column_keys: this.getMappedFieldKeys(snapshot.mappedFields),
      },
    };
  }

  private mergeBackendMetadata(
    existingMetadata: Record<string, unknown> | null,
    incomingMetadata: Record<string, unknown>,
  ): Record<string, unknown> {
    const safeExisting = this.toObject(existingMetadata);
    const safeIncoming = this.toObject(incomingMetadata);
    const existingHikvision = this.sanitizeHikvisionMetadata(this.toObject(safeExisting.hikvision));
    const incomingHikvision = this.sanitizeHikvisionMetadata(this.toObject(safeIncoming.hikvision));

    return {
      ...safeExisting,
      ...safeIncoming,
      hikvision: {
        ...existingHikvision,
        ...incomingHikvision,
      },
    };
  }

  private async resolveDeviceCode(
    companyId: number,
    preferredCode?: string,
    currentId?: number,
  ): Promise<string> {
    if (preferredCode?.trim()) {
      const normalized = preferredCode.trim();
      const existing = await this.deviceRepository.findOne({
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
      const candidate = `HIK-${companyId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const existing = await this.deviceRepository.findOne({
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

  private async ensureIpPortUnique(
    companyId: number,
    ipAddress: string,
    port: number,
    currentId?: number,
  ): Promise<void> {
    const existing = await this.deviceRepository
      .createQueryBuilder('device')
      .where('device.company_id = :companyId', { companyId })
      .andWhere('device.ip_address = :ipAddress', { ipAddress })
      .andWhere('device.port = :port', { port })
      .andWhere('device.deleted_at IS NULL')
      .andWhere(
        '(LOWER(device.integration_type) = :integrationType OR LOWER(COALESCE(device.vendor_name, \'\')) LIKE :vendor)',
        {
          integrationType: this.integrationType,
          vendor: '%hikvision%',
        },
      )
      .select(['device.id'])
      .getOne();

    if (existing && existing.id !== currentId) {
      throw new ConflictException('A Hikvision device with this IP and port already exists');
    }
  }

  private async findHikvisionDeviceOrFail(companyId: number, id: number): Promise<AttendanceDevice> {
    const device = await this.deviceRepository.findOne({ where: { id, companyId } });
    if (!device) {
      throw new NotFoundException('Hikvision device not found');
    }

    const isHikvision =
      (device.integrationType || '').toLowerCase() === this.integrationType ||
      (device.vendorName || '').toLowerCase().includes('hikvision');

    if (!isHikvision) {
      throw new BadRequestException('Requested device is not configured as a Hikvision integration');
    }

    return device;
  }

  private async findAllHikvisionDevices(
    companyId: number,
    dto: SyncAllHikvisionDevicesDto,
  ): Promise<AttendanceDevice[]> {
    const qb = this.deviceRepository
      .createQueryBuilder('device')
      .where('device.company_id = :companyId', { companyId })
      .andWhere(
        '(LOWER(device.integration_type) = :integrationType OR LOWER(COALESCE(device.vendor_name, \'\')) LIKE :vendor)',
        {
          integrationType: this.integrationType,
          vendor: '%hikvision%',
        },
      );

    if (dto.branch_id) {
      qb.andWhere('device.branch_id = :branchId', { branchId: dto.branch_id });
    }

    if (dto.status !== undefined) {
      qb.andWhere('device.status = :status', { status: dto.status });
    }

    return qb.getMany();
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

  private buildFailedEndpointException(endpoint: string, status: number, body: string): HttpException {
    const payloadSummary = body?.trim()?.slice(0, 200) || 'No response body';
    if (status === 401) {
      return new BadRequestException(`Hikvision auth failed on ${endpoint} (401 Unauthorized)`);
    }
    if (status === 404) {
      return new BadRequestException(
        `Hikvision endpoint not found: ${endpoint} (404). Check device ISAPI support`,
      );
    }
    if (status === 400) {
      return new BadRequestException(`Bad request for ${endpoint}: ${payloadSummary}`);
    }
    return new BadRequestException(
      `Hikvision request failed for ${endpoint} with status ${status}: ${payloadSummary}`,
    );
  }

  private buildCredentialsFromDevice(device: AttendanceDevice): HikvisionConnectionCredentials {
    if (!device.ipAddress) {
      throw new BadRequestException('Missing ip_address for this device');
    }

    if (!device.apiUsername || !device.apiPassword) {
      throw new BadRequestException('Missing Hikvision credentials for this device');
    }

    return {
      ipAddress: device.ipAddress,
      port: device.port || this.resolvePort(undefined, this.resolveProtocol(device.protocol)),
      protocol: this.resolveProtocol(device.protocol),
      username: device.apiUsername,
      password: device.apiPassword,
    };
  }

  private resolvePort(port?: number | null, protocol = 'http'): number {
    if (port && Number.isFinite(port) && port > 0) {
      return port;
    }

    const envDefault = Number(this.configService.get<string>('HIKVISION_DEFAULT_PORT') ?? 0);
    if (Number.isFinite(envDefault) && envDefault > 0) {
      return envDefault;
    }

    return protocol === 'https' ? 443 : 80;
  }

  private resolveProtocol(protocol?: string | null): string {
    const envDefault = (
      this.configService.get<string>('HIKVISION_DEFAULT_PROTOCOL') ?? 'http'
    ).trim().toLowerCase();
    const fallback = envDefault === 'https' ? 'https' : 'http';
    const candidate = protocol?.trim().toLowerCase() || fallback;
    return candidate === 'https' ? 'https' : 'http';
  }

  private resolveTimezoneDefault(): string {
    return (
      this.configService.get<string>('HIKVISION_DEFAULT_TIMEZONE') ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      'UTC'
    );
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private normalizeConnectionTarget(
    rawAddress: string,
    port?: number | null,
    protocol?: string | null,
  ): { ipAddress: string; port: number; protocol: string } {
    const parsed = this.parseConnectionTarget(rawAddress);
    const normalizedProtocol = this.resolveProtocol(protocol ?? parsed.protocol);
    const normalizedPort = this.resolvePort(port ?? parsed.port, normalizedProtocol);
    const ipAddress = parsed.ipAddress.trim();

    if (!ipAddress) {
      throw new BadRequestException('ip_address is required');
    }

    if (ipAddress.length > 64) {
      throw new BadRequestException('Resolved device host is too long for ip_address column');
    }

    return {
      ipAddress,
      port: normalizedPort,
      protocol: normalizedProtocol,
    };
  }

  private parseConnectionTarget(rawAddress: string): ParsedConnectionTarget {
    const raw = rawAddress?.trim();
    if (!raw) {
      throw new BadRequestException('ip_address is required');
    }

    let parsed: URL;
    try {
      if (/^https?:\/\//i.test(raw)) {
        parsed = new URL(raw);
      } else {
        parsed = new URL(`http://${raw}`);
      }
    } catch {
      throw new BadRequestException(
        'Invalid ip_address. Use IP/host, host:port, or URL (http/https)',
      );
    }

    const hostname = parsed.hostname?.trim();
    if (!hostname) {
      throw new BadRequestException('Invalid ip_address: missing host');
    }

    const port = parsed.port ? Number(parsed.port) : undefined;
    if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new BadRequestException('Invalid port in ip_address URL');
    }

    return {
      ipAddress: hostname,
      port,
      protocol: parsed.protocol?.replace(':', '').toLowerCase(),
    };
  }

  private getMappedSourceKeys(): Set<string> {
    return new Set([
      'deviceName',
      'deviceID',
      'deviceId',
      'serialNumber',
      'model',
      'firmwareVersion',
      'macAddress',
      'deviceType',
      'deviceDescription',
      'timeZone',
      'timezone',
      'manufacturer',
      'vendorName',
      'name',
    ]);
  }

  private stripMappedKeysDeep(
    source: Record<string, unknown>,
    keysToStrip: Set<string>,
  ): Record<string, unknown> {
    const visit = (node: unknown): unknown => {
      if (Array.isArray(node)) {
        return node.map((item) => visit(item));
      }

      if (node && typeof node === 'object') {
        const record = node as Record<string, unknown>;
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(record)) {
          if (keysToStrip.has(key)) {
            continue;
          }

          result[key] = visit(value);
        }
        return result;
      }

      return node;
    };

    return visit(source) as Record<string, unknown>;
  }

  private extractFirstExistingRoot(
    source: Record<string, unknown>,
    candidateKeys: string[],
  ): Record<string, unknown> {
    for (const key of candidateKeys) {
      const candidate = source[key];
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        return candidate as Record<string, unknown>;
      }
    }

    return source;
  }

  private getMappedFieldKeys(mappedFields: HikvisionMappedDeviceFields): string[] {
    return Object.entries(mappedFields)
      .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
      .map(([key]) => key);
  }

  private sanitizeHikvisionMetadata(value: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...value };
    // These carry column-mapped values and must not persist in metadata.
    delete sanitized.endpoints;
    delete sanitized.mapped_fields;
    return sanitized;
  }

  private async trySetDeviceCode(device: AttendanceDevice, value: string): Promise<boolean> {
    const normalized = value.trim();
    if (!normalized || normalized === device.deviceCode) {
      return false;
    }

    const existing = await this.deviceRepository.findOne({
      where: { deviceCode: normalized },
      select: ['id'],
      withDeleted: true,
    });

    if (existing && existing.id !== device.id) {
      return false;
    }

    device.deviceCode = normalized;
    return true;
  }

  private extractSupportedUserVerifyModes(capabilities: Record<string, unknown>): string[] {
    const modes: string[] = [];

    const visit = (node: unknown): void => {
      if (!node) return;

      if (Array.isArray(node)) {
        for (const item of node) {
          visit(item);
        }
        return;
      }

      if (typeof node !== 'object') {
        return;
      }

      const record = node as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (key.toLowerCase() === 'userverifymode') {
          const valueRoot =
            value && typeof value === 'object' && !Array.isArray(value)
              ? (value as Record<string, unknown>)
              : {};
          const raw = [valueRoot['@opt'], valueRoot.opt, valueRoot.options, valueRoot.option]
            .map((item) => (item === null || item === undefined ? '' : String(item).trim()))
            .find((item) => item.length > 0);

          if (raw) {
            modes.push(...raw.split(',').map((item) => item.trim()));
          }
        }

        visit(value);
      }
    };

    visit(capabilities);

    return [...new Set(modes.filter((item) => item.length > 0))];
  }

  private mapDevice(device: AttendanceDevice) {
    const hikvisionMetadata = this.toObject(this.toObject(device.metadata).hikvision);

    return {
      id: device.id,
      company_id: device.companyId,
      branch_id: device.branchId,
      device_name: device.deviceName,
      device_code: device.deviceCode,
      device_serial_number: device.deviceSerialNumber,
      device_model: device.deviceModel,
      ip_address: device.ipAddress,
      port: device.port,
      protocol: device.protocol,
      vendor_name: device.vendorName,
      integration_type: device.integrationType,
      auth_type: device.authType,
      api_username: device.apiUsername,
      sync_mode: device.syncMode,
      status: device.status,
      last_sync_at: device.lastSyncAt,
      last_heartbeat_at: device.lastHeartbeatAt,
      firmware_version: device.firmwareVersion,
      mac_address: device.macAddress,
      device_type: device.deviceType,
      timezone: device.timezone,
      location_description: device.locationDescription,
      supported_user_verify_modes: Array.isArray(hikvisionMetadata.supported_user_verify_modes)
        ? hikvisionMetadata.supported_user_verify_modes
        : [],
      metadata: device.metadata,
      created_at: device.createdAt,
      updated_at: device.updatedAt,
      deleted_at: device.deletedAt,
    };
  }
}


