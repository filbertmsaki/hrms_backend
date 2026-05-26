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
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { Branch } from '../../branches/entities/branch.entity';
import { AttendanceDeviceStatusEnum } from '../devices/enums/attendance-device-status.enum';
import { AttendanceDeviceSyncModeEnum } from '../devices/enums/attendance-device-sync-mode.enum';
import { AttendanceDevice } from '../devices/entities/attendance-device.entity';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { AttendanceFilterDto } from './dto/attendance-filter.dto';
import { AcsEventQueryDto } from './dto/acs-event-query.dto';
import { CreateHikvisionDeviceDto } from './dto/create-hikvision-device.dto';
import { SyncAttendanceDto } from './dto/sync-attendance.dto';
import { AttendanceLog } from './entities/attendance-log.entity';
import { buildHikvisionConfig } from './hikvision.config';
import { HikvisionListener } from './hikvision.listener';
import { HikvisionAuthService } from './hikvision-auth.service';
import { HikvisionParserHelper } from './helpers/hikvision-parser.helper';
import { normalizeHikvisionError } from './helpers/hikvision-request.helper';
import { HikvisionAcsEventResponse } from './interfaces/acs-event-response.interface';
import { HikvisionEvent } from './interfaces/hikvision-event.interface';

type DeviceFilter = {
  branch_id?: number;
  is_active?: boolean;
};

type SaveLogResult = {
  saved: number;
  duplicates: number;
  skipped: number;
};

@Injectable()
export class HikvisionService {
  private readonly logger = new Logger(HikvisionService.name);
  private readonly hikvisionIntegrationType = 'hikvision';

  constructor(
    @InjectRepository(AttendanceDevice)
    private readonly deviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(AttendanceLog)
    private readonly attendanceLogRepository: Repository<AttendanceLog>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    private readonly configService: ConfigService,
    private readonly authService: HikvisionAuthService,
    private readonly parserHelper: HikvisionParserHelper,
    private readonly listener: HikvisionListener,
  ) {}

  async createDevice(companyId: number, dto: CreateHikvisionDeviceDto) {
    await this.ensureBranch(companyId, dto.branch_id);
    const config = buildHikvisionConfig(this.configService);
    const port = dto.port ?? config.defaultPort;

    const existing = await this.deviceRepository.findOne({
      where: {
        companyId,
        ipAddress: dto.ip_address,
        port,
      },
      select: ['id'],
    });

    if (existing) {
      throw new ConflictException('Hikvision device with the same IP and port already exists');
    }

    const probedInfo = await this.fetchDeviceInfo({
      ipAddress: dto.ip_address,
      port,
      apiUsername: dto.username?.trim() || config.defaultUsername,
      apiPassword: dto.password || config.defaultPassword,
    }).catch(() => null);

    const deviceCode = `HIK-${companyId}-${Date.now()}`;
    const entity = this.deviceRepository.create({
      companyId,
      branchId: dto.branch_id ?? null,
      deviceName: dto.name.trim() || probedInfo?.deviceName || 'Hikvision Device',
      deviceCode,
      deviceSerialNumber: probedInfo?.serialNumber || `HK-${Date.now()}`,
      deviceModel: probedInfo?.model || 'Unknown Model',
      ipAddress: dto.ip_address,
      port,
      protocol: dto.protocol?.trim() || 'ISAPI',
      vendorName: 'Hikvision',
      integrationType: this.hikvisionIntegrationType,
      authType: 'digest',
      apiUsername: dto.username?.trim() || config.defaultUsername,
      apiPassword: dto.password || config.defaultPassword,
      syncMode: AttendanceDeviceSyncModeEnum.PULL,
      status: dto.is_active === false
        ? AttendanceDeviceStatusEnum.INACTIVE
        : AttendanceDeviceStatusEnum.ACTIVE,
      firmwareVersion: probedInfo?.firmwareVersion || null,
      macAddress: probedInfo?.macAddress || null,
      deviceType: probedInfo?.deviceType || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      locationDescription: null,
      metadata: {
        provider: 'Hikvision',
        integration_type: this.hikvisionIntegrationType,
        auth_type: 'digest',
        device_info: probedInfo,
      },
      isActive: dto.is_active ?? true,
    });

    const created = await this.deviceRepository.save(entity);
    return this.mapDevice(created);
  }

  async updateDevice(companyId: number, id: number, dto: Partial<CreateHikvisionDeviceDto>) {
    const device = await this.findDeviceOrFail(companyId, id);

    if (dto.branch_id !== undefined) {
      await this.ensureBranch(companyId, dto.branch_id);
      device.branchId = dto.branch_id ?? null;
    }

    if (dto.name !== undefined) device.deviceName = dto.name.trim();
    if (dto.ip_address !== undefined) device.ipAddress = dto.ip_address;
    if (dto.port !== undefined) device.port = dto.port;
    if (dto.username !== undefined) device.apiUsername = dto.username.trim();
    if (dto.password !== undefined) device.apiPassword = dto.password;
    if (dto.protocol !== undefined) device.protocol = dto.protocol.trim();
    if (dto.is_active !== undefined) {
      device.isActive = dto.is_active;
      device.status = dto.is_active
        ? AttendanceDeviceStatusEnum.ACTIVE
        : AttendanceDeviceStatusEnum.INACTIVE;
    }

    const updated = await this.deviceRepository.save(device);
    return this.mapDevice(updated);
  }

  async getDevices(companyId: number, filters: DeviceFilter = {}) {
    const qb = this.deviceRepository
      .createQueryBuilder('device')
      .where('device.company_id = :companyId', { companyId })
      .andWhere(
        '(LOWER(device.integration_type) = :integrationType OR LOWER(COALESCE(device.vendor_name, \'\')) LIKE :vendor)',
        {
          integrationType: this.hikvisionIntegrationType,
          vendor: '%hikvision%',
        },
      );

    if (filters.branch_id) {
      qb.andWhere('device.branch_id = :branchId', { branchId: filters.branch_id });
    }

    if (filters.is_active !== undefined) {
      qb.andWhere('device.is_active = :isActive', { isActive: filters.is_active });
    }

    const devices = await qb.orderBy('device.created_at', 'DESC').getMany();
    return devices.map((device) => this.mapDevice(device));
  }

  async testDeviceConnection(companyId: number, id: number) {
    const device = await this.findDeviceOrFail(companyId, id);
    const start = new Date(Date.now() - 60_000).toISOString();
    const end = new Date().toISOString();

    const queryDto: AcsEventQueryDto = {
      search_id: `test-${Date.now()}`,
      search_result_position: 0,
      max_results: 1,
      major: 5,
      start_time: start,
      end_time: end,
    };

    try {
      const payload = await this.fetchAcsEvents(device, queryDto);
      const response = payload as HikvisionAcsEventResponse;
      const status = response.AcsEvent?.responseStatusStrg ?? 'UNKNOWN';
      return {
        success: true,
        message: 'Hikvision device connection test succeeded',
        response_status: status,
      };
    } catch (error) {
      throw normalizeHikvisionError(error);
    }
  }

  async syncAttendance(companyId: number, id: number, dto: SyncAttendanceDto) {
    const device = await this.findDeviceOrFail(companyId, id);
    const config = buildHikvisionConfig(this.configService);

    const startTime = dto.start_time ?? this.defaultStartOfToday();
    const endTime = dto.end_time ?? this.defaultEndOfToday();
    if (new Date(startTime).getTime() > new Date(endTime).getTime()) {
      throw new BadRequestException('start_time must be before end_time');
    }

    let searchResultPosition = 0;
    const maxResults = dto.max_results ?? config.syncPageSize;
    let totalFetched = 0;
    let totalSaved = 0;
    let totalDuplicates = 0;
    let totalSkipped = 0;
    let totalMatches = Number.POSITIVE_INFINITY;
    const searchId = dto.search_id ?? `${Date.now()}`;

    this.logger.log(`Starting Hikvision attendance sync for device ${device.id}`);

    try {
      while (searchResultPosition < totalMatches) {
        const queryDto: AcsEventQueryDto = {
          search_id: searchId,
          search_result_position: searchResultPosition,
          max_results: maxResults,
          major: dto.major ?? 5,
          start_time: this.toHikvisionDateTime(startTime),
          end_time: this.toHikvisionDateTime(endTime),
        };

        const payload = await this.fetchAcsEvents(device, queryDto);
        const parsedResponse = payload as HikvisionAcsEventResponse;
        const events = this.parserHelper.extractAcsEvents(payload);

        const pageMatches = Number(parsedResponse.AcsEvent?.numOfMatches ?? events.length ?? 0);
        const pageTotal = Number(parsedResponse.AcsEvent?.totalMatches ?? 0);
        if (Number.isFinite(pageTotal) && pageTotal >= 0) {
          totalMatches = pageTotal;
        }

        if (!events.length || pageMatches === 0) {
          this.logger.log(`No more attendance records for device ${device.id}, sync completed`);
          break;
        }

        for (const event of events) {
          const result = await this.saveAttendanceLog(companyId, device, event);
          totalSaved += result.saved;
          totalDuplicates += result.duplicates;
          totalSkipped += result.skipped;
        }

        totalFetched += events.length;
        searchResultPosition += pageMatches;

        if (searchResultPosition >= totalMatches) {
          break;
        }
      }

      await this.deviceRepository.update(device.id, { lastSyncAt: new Date() });
      this.logger.log(
        `Successful sync for device ${device.id}: fetched=${totalFetched} saved=${totalSaved} duplicates=${totalDuplicates} skipped=${totalSkipped}`,
      );

      return {
        message: 'Attendance sync completed',
        device_id: device.id,
        fetched: totalFetched,
        saved: totalSaved,
        duplicates: totalDuplicates,
        skipped: totalSkipped,
        start_time: startTime,
        end_time: endTime,
      };
    } catch (error) {
      this.logger.error(
        `Failed sync for device ${device.id}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw normalizeHikvisionError(error);
    }
  }

  async getAttendanceLogs(companyId: number, query: AttendanceFilterDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'event_time',
      sortOrder = SortDirection.DESC,
      device_id,
      branch_id,
      employee_no,
      from_time,
      to_time,
      event_type,
      attendance_status,
    } = query;

    const qb = this.attendanceLogRepository
      .createQueryBuilder('log')
      .where('log.company_id = :companyId', { companyId });

    if (device_id) qb.andWhere('log.device_id = :deviceId', { deviceId: device_id });
    if (branch_id) qb.andWhere('log.branch_id = :branchId', { branchId: branch_id });
    if (employee_no) qb.andWhere('log.employee_no = :employeeNo', { employeeNo: employee_no });
    if (from_time) qb.andWhere('log.event_time >= :fromTime', { fromTime: from_time });
    if (to_time) qb.andWhere('log.event_time <= :toTime', { toTime: to_time });
    if (event_type) qb.andWhere('log.event_type = :eventType', { eventType: event_type });
    if (attendance_status) {
      qb.andWhere('log.attendance_status = :attendanceStatus', {
        attendanceStatus: attendance_status,
      });
    }

    const allowedSortFields = ['event_time', 'created_at', 'employee_no', 'major', 'minor'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'event_time';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb
      .orderBy(`log.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapAttendanceLog(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async startAlertStream(companyId: number, id: number) {
    const device = await this.findDeviceOrFail(companyId, id);
    if (this.listener.isRunning(device.id)) {
      return { message: 'Alert stream listener already running', device_id: device.id };
    }

    await this.listener.start(device, async (event) => {
      const result = await this.saveAttendanceLog(companyId, device, event);
      await this.deviceRepository.update(device.id, { lastListenerAt: new Date() });

      if (result.saved) {
        this.logger.log(`Attendance saved from stream for device ${device.id}`);
      } else if (result.duplicates) {
        this.logger.debug(`Duplicate skipped from stream for device ${device.id}`);
      }
    });

    await this.deviceRepository.update(device.id, { lastListenerAt: new Date() });
    this.logger.log(`Stream connected for device ${device.id}`);
    return { message: 'Alert stream listener started', device_id: device.id };
  }

  async stopAlertStream(companyId: number, id: number) {
    await this.findDeviceOrFail(companyId, id);
    await this.listener.stop(id);
    return { message: 'Alert stream listener stopped', device_id: id };
  }

  async reconnectAlertStream(companyId: number, id: number) {
    await this.stopAlertStream(companyId, id);
    return this.startAlertStream(companyId, id);
  }

  parseHikvisionEvent(payload: string | Record<string, unknown>) {
    const parsedPayload = typeof payload === 'string' ? this.parserHelper.parsePayload(payload) : payload;
    return this.parserHelper.parseHikvisionEvent(parsedPayload);
  }

  async saveAttendanceLog(
    companyId: number,
    device: AttendanceDevice,
    event: HikvisionEvent,
  ): Promise<SaveLogResult> {
    if (!event.employeeNo && !event.cardNo) {
      return { saved: 0, duplicates: 0, skipped: 1 };
    }

    const eventTime = new Date(event.eventTime);
    if (Number.isNaN(eventTime.getTime())) {
      return { saved: 0, duplicates: 0, skipped: 1 };
    }

    const insertResult = await this.attendanceLogRepository
      .createQueryBuilder()
      .insert()
      .into(AttendanceLog)
      .values({
        companyId,
        branchId: device.branchId ?? null,
        deviceId: device.id,
        employeeNo: event.employeeNo || '',
        employeeName: event.employeeName || null,
        cardNo: event.cardNo || null,
        eventTime,
        major: event.major,
        minor: event.minor,
        eventType: event.eventType,
        attendanceStatus: event.attendanceStatus,
        verifyMode: event.verifyMode || null,
        doorNo: event.doorNo ?? null,
        serialNo: event.serialNo || null,
        deviceTime: event.deviceTime ? new Date(event.deviceTime) : eventTime,
        rawPayload: event.rawPayload as any,
      })
      .orIgnore()
      .execute();

    if (!insertResult.identifiers.length) {
      this.logger.debug(
        `Duplicate skipped for device ${device.id}, employee ${event.employeeNo}, time ${event.eventTime}`,
      );
      return { saved: 0, duplicates: 1, skipped: 0 };
    }

    return { saved: 1, duplicates: 0, skipped: 0 };
  }

  private async fetchAcsEvents(
    device: AttendanceDevice,
    dto: AcsEventQueryDto,
  ): Promise<Record<string, unknown>> {
    const endpoints = [
      '/ISAPI/AccessControl/AcsEvent?format=json',
      '/ISAPI/AccessControl/AcsEvent',
    ];
    const errors: string[] = [];

    const timeVariants = this.buildAcsEventTimeVariants(dto.start_time, dto.end_time);

    for (const endpoint of endpoints) {
      for (const variant of timeVariants) {
        const body = {
          AcsEventCond: {
            searchID: dto.search_id,
            searchResultPosition: dto.search_result_position,
            maxResults: dto.max_results,
            major: dto.major ?? 5,
            minor: 0,
            startTime: variant.startTime,
            endTime: variant.endTime,
          },
        };

        const response = await this.authService.request(device, endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json, application/xml',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        const text = await response.text();
        if (response.ok) {
          return this.parserHelper.parsePayload(text);
        }

        const detail = this.extractHikvisionErrorDetails(text);
        errors.push(`JSON ${endpoint} [${variant.label}] -> ${detail.summary}`);
      }
    }

    const xmlEndpoints = [
      '/ISAPI/AccessControl/AcsEvent?format=xml',
      '/ISAPI/AccessControl/AcsEvent',
    ];

    for (const endpoint of xmlEndpoints) {
      for (const variant of timeVariants) {
        const xmlBodies = this.buildAcsEventXmlVariants(dto, variant.startTime, variant.endTime);

        for (const xmlBody of xmlBodies) {
          const response = await this.authService.request(device, endpoint, {
            method: 'POST',
            headers: {
              Accept: 'application/json, application/xml',
              'Content-Type': xmlBody.contentType,
            },
            body: xmlBody.body,
          });

          const text = await response.text();
          if (response.ok) {
            this.logger.log(`AcsEvent XML fallback succeeded for device ${device.id}`);
            return this.parserHelper.parsePayload(text);
          }

          const detail = this.extractHikvisionErrorDetails(text);
          errors.push(`XML ${endpoint} [${variant.label}/${xmlBody.name}] -> ${detail.summary}`);
        }
      }
    }

    throw new BadRequestException(
      `Hikvision rejected all AcsEvent request formats. ${errors.slice(0, 6).join(' ; ')}`,
    );
  }

  private async findDeviceOrFail(companyId: number, id: number): Promise<AttendanceDevice> {
    const device = await this.deviceRepository.findOne({ where: { id, companyId } });
    if (!device) {
      throw new NotFoundException('Hikvision device not found');
    }
    const isHikvisionDevice = (device.integrationType || '').toLowerCase() === this.hikvisionIntegrationType
      || (device.vendorName || '').toLowerCase().includes('hikvision');
    if (!isHikvisionDevice) {
      throw new BadRequestException('Requested device is not configured as a Hikvision integration');
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

  private async fetchDeviceInfo(
    device: Pick<AttendanceDevice, 'ipAddress' | 'port' | 'apiUsername' | 'apiPassword'>,
  ): Promise<{
    deviceName?: string;
    model?: string;
    serialNumber?: string;
    firmwareVersion?: string;
    macAddress?: string;
    deviceType?: string;
  } | null> {
    const response = await this.authService.request(device, '/ISAPI/System/deviceInfo', {
      method: 'GET',
      headers: { Accept: 'application/json, application/xml' },
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    if (!text?.trim()) {
      return null;
    }

    const payload = this.parserHelper.parsePayload(text);
    const info = (payload.DeviceInfo as Record<string, unknown>) ?? payload;

    return {
      deviceName: this.pickString(info, ['deviceName']),
      model: this.pickString(info, ['model']),
      serialNumber: this.pickString(info, ['serialNumber']),
      firmwareVersion: this.pickString(info, ['firmwareVersion']),
      macAddress: this.pickString(info, ['macAddress']),
      deviceType: this.pickString(info, ['deviceType']),
    };
  }

  private mapDevice(device: AttendanceDevice) {
    return {
      id: device.id,
      company_id: device.companyId,
      branch_id: device.branchId,
      name: device.deviceName,
      ip_address: device.ipAddress,
      port: device.port,
      username: device.apiUsername,
      protocol: device.protocol,
      vendor_name: device.vendorName,
      integration_type: device.integrationType,
      auth_type: device.authType,
      device_code: device.deviceCode,
      device_model: device.deviceModel,
      device_serial_number: device.deviceSerialNumber,
      is_active: device.isActive,
      status: device.status,
      last_sync_at: device.lastSyncAt,
      last_listener_at: device.lastListenerAt,
      created_at: device.createdAt,
      updated_at: device.updatedAt,
    };
  }

  private mapAttendanceLog(log: AttendanceLog) {
    return {
      id: log.id,
      company_id: log.companyId,
      branch_id: log.branchId,
      device_id: log.deviceId,
      employee_no: log.employeeNo,
      employee_name: log.employeeName,
      card_no: log.cardNo,
      event_time: log.eventTime,
      major: log.major,
      minor: log.minor,
      event_type: log.eventType,
      attendance_status: log.attendanceStatus,
      verify_mode: log.verifyMode,
      door_no: log.doorNo,
      serial_no: log.serialNo,
      device_time: log.deviceTime,
      raw_payload: log.rawPayload,
      created_at: log.createdAt,
    };
  }

  private defaultStartOfToday(): string {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return this.toHikvisionDateTime(now.toISOString());
  }

  private defaultEndOfToday(): string {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    return this.toHikvisionDateTime(now.toISOString());
  }

  private toHikvisionDateTime(input: string): string {
    const raw = input.trim();
    // keep timezone, remove milliseconds (Hikvision parsers often reject milliseconds)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z)?$/.test(raw)) {
      return raw;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return raw;
    }

    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    const hh = String(parsed.getHours()).padStart(2, '0');
    const mi = String(parsed.getMinutes()).padStart(2, '0');
    const ss = String(parsed.getSeconds()).padStart(2, '0');

    const offsetMinutes = -parsed.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMinutes);
    const offH = String(Math.floor(abs / 60)).padStart(2, '0');
    const offM = String(abs % 60).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${offH}:${offM}`;
  }

  private buildAcsEventXmlVariants(
    dto: AcsEventQueryDto,
    startTime: string,
    endTime: string,
  ): Array<{ name: string; contentType: string; body: string }> {
    const base = `
<AcsEventCond>
  <searchID>${dto.search_id}</searchID>
  <searchResultPosition>${dto.search_result_position}</searchResultPosition>
  <maxResults>${dto.max_results}</maxResults>
  <major>${dto.major ?? 5}</major>
  <minor>0</minor>
  <startTime>${startTime}</startTime>
  <endTime>${endTime}</endTime>
</AcsEventCond>`.trim();

    return [
      {
        name: 'plain-text-xml',
        contentType: 'text/xml',
        body: base,
      },
      {
        name: 'isapi-namespace',
        contentType: 'application/xml',
        body: `<?xml version="1.0" encoding="UTF-8"?>
<AcsEventCond version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <searchID>${dto.search_id}</searchID>
  <searchResultPosition>${dto.search_result_position}</searchResultPosition>
  <maxResults>${dto.max_results}</maxResults>
  <major>${dto.major ?? 5}</major>
  <minor>0</minor>
  <startTime>${startTime}</startTime>
  <endTime>${endTime}</endTime>
</AcsEventCond>`,
      },
      {
        name: 'hikvision-namespace',
        contentType: 'application/xml',
        body: `<?xml version="1.0" encoding="UTF-8"?>
<AcsEventCond version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <searchID>${dto.search_id}</searchID>
  <searchResultPosition>${dto.search_result_position}</searchResultPosition>
  <maxResults>${dto.max_results}</maxResults>
  <major>${dto.major ?? 5}</major>
  <minor>0</minor>
  <startTime>${startTime}</startTime>
  <endTime>${endTime}</endTime>
</AcsEventCond>`,
      },
    ];
  }

  private buildAcsEventTimeVariants(
    startTime: string,
    endTime: string,
  ): Array<{ label: string; startTime: string; endTime: string }> {
    const raw = {
      label: 'raw',
      startTime,
      endTime,
    };
    const noTimezone = {
      label: 'no-timezone',
      startTime: this.stripTimezoneOffset(startTime),
      endTime: this.stripTimezoneOffset(endTime),
    };
    const utcZulu = {
      label: 'utc-zulu',
      startTime: this.toUtcZulu(startTime),
      endTime: this.toUtcZulu(endTime),
    };

    const map = new Map<string, { label: string; startTime: string; endTime: string }>();
    for (const item of [raw, noTimezone, utcZulu]) {
      map.set(`${item.startTime}|${item.endTime}`, item);
    }
    return Array.from(map.values());
  }

  private stripTimezoneOffset(value: string): string {
    return value.replace(/(\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/, '');
  }

  private toUtcZulu(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  private pickString(source: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null) {
        const normalized = String(value).trim();
        if (normalized) {
          return normalized;
        }
      }
    }
    return undefined;
  }

  private extractHikvisionErrorDetails(rawBody: string): {
    subStatusCode: string;
    errorCode: string;
    errorMsg: string;
    summary: string;
  } {
    const fallback = {
      subStatusCode: '',
      errorCode: '',
      errorMsg: '',
      summary: rawBody?.trim()?.slice(0, 250) || 'No error body',
    };

    if (!rawBody?.trim()) {
      return fallback;
    }

    try {
      const parsed = this.parserHelper.parsePayload(rawBody);
      const status = (parsed.ResponseStatus as Record<string, unknown>) ?? parsed;
      const subStatusCode = String(status.subStatusCode ?? '');
      const errorCode = String(status.errorCode ?? '');
      const errorMsg = String(status.errorMsg ?? status.statusString ?? '');
      const summary = [subStatusCode, errorCode, errorMsg]
        .filter((value) => value && value !== 'undefined')
        .join(' | ');

      return {
        subStatusCode,
        errorCode,
        errorMsg,
        summary: summary || fallback.summary,
      };
    } catch {
      return fallback;
    }
  }

  private buildAcsEventException(status: number, detail: string): HttpException {
    if (status === 400) {
      return new BadRequestException(`Hikvision rejected request (400 Bad Request): ${detail}`);
    }

    return new BadRequestException(`AcsEvent request failed with status ${status}: ${detail}`);
  }
}
