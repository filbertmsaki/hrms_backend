import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { SortDirection } from '../../common/dto/pagination.dto';
import { AttendanceDevice } from '../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../access-control/attendance-devices/enums/attendance-device-status.enum';
import { buildPaginationMeta } from '../hr/shared/hr.utils';
import { buildAttendanceDeviceSearchId } from '../access-control/attendance-devices/utils/attendance-device-search-id.util';
import { HikvisionSyncLog } from '../access-control/hikvision-sync-logs/entity/hikvision-sync-log.entity';
import { HikvisionSyncLogDirectionEnum } from '../access-control/hikvision-sync-logs/enum/hikvision-sync-log-direction.enum';
import { HikvisionSyncLogStatusEnum } from '../access-control/hikvision-sync-logs/enum/hikvision-sync-log-status.enum';
import { HikvisionSyncLogTypeEnum } from '../access-control/hikvision-sync-logs/enum/hikvision-sync-log-type.enum';
import { AcsEventCondDto } from './dto/acs-event-cond.dto';
import { QueryHikvisionAttendanceLogsDto } from './dto/query-hikvision-attendance-logs.dto';
import { HikvisionAttendanceLog } from './entities/hikvision-attendance-log.entity';
import { HikvisionAccessControlService } from './hikvision-access-control.service';

type AttendanceSyncStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED';

type SyncAccumulator = {
  totalMatches: number;
  recordsReceived: number;
  recordsInserted: number;
  recordsSkipped: number;
  recordsFailed: number;
  recordsUpdated: number;
};

type DeviceLike = Pick<AttendanceDevice, 'id' | 'companyId' | 'branchId' | 'timezone'>;

type ParsedAcsEventPage = {
  searchID: string;
  responseStatusStrg: string;
  numOfMatches: number;
  totalMatches: number;
  infoList: Record<string, unknown>[];
  raw: Record<string, unknown>;
};

type PersistResult = {
  received: number;
  inserted: number;
  skipped: number;
  failed: number;
  updated: number;
};

type MappedAttendanceRow = {
  companyId: number;
  branchId: number | null;
  deviceId: number;
  employeeNo: string;
  employeeName: string | null;
  cardNo: string | null;
  eventTime: Date;
  major: number;
  minor: number;
  eventType: string | null;
  attendanceStatus: string | null;
  verifyMode: string | null;
  doorNo: number | null;
  cardReaderNo: number | null;
  serialNo: string | null;
  deviceTime: Date | null;
  remoteHostAddr: string | null;
  netUser: string | null;
  userType: string | null;
  statusValue: number | null;
  rawPayload: Record<string, unknown>;
};

@Injectable()
export class HikvisionAttendanceSyncService {
  private readonly logger = new Logger(HikvisionAttendanceSyncService.name);

  constructor(
    @InjectRepository(AttendanceDevice)
    private readonly deviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(HikvisionAttendanceLog)
    private readonly attendanceLogRepository: Repository<HikvisionAttendanceLog>,
    @InjectRepository(HikvisionSyncLog)
    private readonly hikvisionSyncLogRepository: Repository<HikvisionSyncLog>,
    private readonly hikvisionAccessControlService: HikvisionAccessControlService,
  ) {}

  async getAcsEventCapabilities(companyId: number, deviceId: number) {
    await this.findActiveHikvisionDeviceOrFail(companyId, deviceId);

    const response = await this.hikvisionAccessControlService.getAcsEventCapabilities(
      companyId,
      deviceId,
    );
    if (!response.ok) {
      throw new BadRequestException(
        `AcsEvent capabilities request failed with HTTP ${response.status}`,
      );
    }

    const parsed = this.toObject(response.parsed);
    return {
      deviceId,
      capabilities: parsed,
      maxResultsCapability: this.resolveMaxResultsCapability(parsed) ?? null,
    };
  }

  async syncAttendanceByDate(
    companyId: number,
    deviceId: number,
    date: string,
    timezone?: string,
    maxResults = 100,
  ) {
    const device = await this.findActiveHikvisionDeviceOrFail(companyId, deviceId);
    const selectedTimezone = timezone?.trim() || device.timezone || 'UTC';
    this.ensureValidTimeZone(selectedTimezone);

    const { startTime, endTime } = this.buildDayRange(date, selectedTimezone);
    return this.syncAttendanceByRange(companyId, deviceId, startTime, endTime, maxResults);
  }

  async syncAttendanceByRange(
    companyId: number,
    deviceId: number,
    startTime: string,
    endTime: string,
    maxResults = 100,
  ) {
    this.ensureIsoRange(startTime, endTime);

    const device = await this.findActiveHikvisionDeviceOrFail(companyId, deviceId);
    const effectiveMaxResults = await this.resolveEffectiveMaxResults(
      companyId,
      deviceId,
      this.ensurePositiveInteger(maxResults, 'maxResults'),
    );

    const searchID = buildAttendanceDeviceSearchId('acs_event_date', deviceId);
    return this.syncByCondition(companyId, device, {
      searchID,
      searchResultPosition: 0,
      maxResults: effectiveMaxResults,
      major: 5,
      minor: 0,
      startTime,
      endTime,
    });
  }

  async syncAttendanceByEmployee(
    companyId: number,
    deviceId: number,
    employeeNo: string,
    startTime: string,
    endTime: string,
    maxResults = 100,
  ) {
    this.ensureIsoRange(startTime, endTime);
    const normalizedEmployeeNo = this.ensureEmployeeNo(employeeNo);

    const device = await this.findActiveHikvisionDeviceOrFail(companyId, deviceId);
    const effectiveMaxResults = await this.resolveEffectiveMaxResults(
      companyId,
      deviceId,
      this.ensurePositiveInteger(maxResults, 'maxResults'),
    );

    const searchID = buildAttendanceDeviceSearchId(
      'acs_event_employee',
      deviceId,
      normalizedEmployeeNo,
    );
    return this.syncByCondition(companyId, device, {
      searchID,
      searchResultPosition: 0,
      maxResults: effectiveMaxResults,
      major: 5,
      minor: 0,
      employeeNoString: normalizedEmployeeNo,
      startTime,
      endTime,
    });
  }

  async pullAttendancePage(companyId: number, deviceId: number, payload: AcsEventCondDto) {
    const device = await this.findActiveHikvisionDeviceOrFail(companyId, deviceId);
    const normalized = await this.normalizeCondition(companyId, deviceId, payload);

    const response = await this.requestAcsEventsWithRetry(companyId, deviceId, {
      AcsEventCond: normalized,
    });
    if (!response.ok) {
      throw new BadRequestException(`AcsEvent request failed with HTTP ${response.status}`);
    }

    const parsedPage = this.parseAcsEventPage(response.parsed);
    const persisted = await this.persistAttendanceEvents(device, parsedPage.infoList);

    return {
      deviceId,
      searchID: parsedPage.searchID,
      searchResultPosition: normalized.searchResultPosition ?? 0,
      maxResults: normalized.maxResults ?? 100,
      totalMatches: parsedPage.totalMatches,
      responseStatusStrg: parsedPage.responseStatusStrg,
      numOfMatches: parsedPage.numOfMatches,
      recordsReceived: persisted.received,
      recordsInserted: persisted.inserted,
      recordsSkipped: persisted.skipped,
      recordsFailed: persisted.failed,
      recordsUpdated: persisted.updated,
      status: persisted.failed > 0 ? 'PARTIAL' : 'SUCCESS',
    };
  }

  async findLogs(companyId: number, query: QueryHikvisionAttendanceLogsDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'event_time',
      sortOrder = SortDirection.DESC,
      device_id,
      employee_no,
      major,
      minor,
      door_no,
      serial_no,
      start_time,
      end_time,
    } = query;

    if (device_id) {
      await this.findHikvisionDeviceOrFail(companyId, device_id, false);
    }

    const qb = this.attendanceLogRepository
      .createQueryBuilder('log')
      .where('log.company_id = :companyId', { companyId });

    if (device_id) qb.andWhere('log.device_id = :deviceId', { deviceId: device_id });
    if (employee_no?.trim()) qb.andWhere('log.employee_no = :employeeNo', { employeeNo: employee_no.trim() });
    if (major !== undefined) qb.andWhere('log.major = :major', { major });
    if (minor !== undefined) qb.andWhere('log.minor = :minor', { minor });
    if (door_no !== undefined) qb.andWhere('log.door_no = :doorNo', { doorNo: door_no });
    if (serial_no?.trim()) qb.andWhere('log.serial_no = :serialNo', { serialNo: serial_no.trim() });
    if (start_time) qb.andWhere('log.event_time >= :startTime', { startTime: new Date(start_time) });
    if (end_time) qb.andWhere('log.event_time <= :endTime', { endTime: new Date(end_time) });

    const sortableColumns = new Set(['created_at', 'event_time', 'employee_no', 'major', 'minor']);
    const safeSortBy = sortableColumns.has(sortBy) ? sortBy : 'event_time';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [rows, total] = await qb
      .orderBy(`log.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows.map((row) => this.mapAttendanceLog(row)),
      meta: buildPaginationMeta(total, rows.length, limit, page),
    };
  }

  private async syncByCondition(
    companyId: number,
    device: DeviceLike,
    condition: AcsEventCondDto,
  ) {
    const normalized = await this.normalizeCondition(companyId, device.id, condition);
    const syncStartedAt = new Date();
    const counters: SyncAccumulator = {
      totalMatches: 0,
      recordsReceived: 0,
      recordsInserted: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      recordsUpdated: 0,
    };

    let status: AttendanceSyncStatus = 'SUCCESS';
    let cursor = normalized.searchResultPosition ?? 0;
    let pageIndex = 0;
    let failureReason: string | null = null;

    const totalNumHint = await this.fetchTotalMatchesHint(companyId, device.id, normalized);
    if (totalNumHint !== null) {
      counters.totalMatches = totalNumHint;
    }

    while (true) {
      const pagedCond: AcsEventCondDto = {
        ...normalized,
        searchResultPosition: cursor,
      };

      let response: {
        status: number;
        ok: boolean;
        raw: string;
        parsed: Record<string, unknown> | string;
      };
      try {
        response = await this.requestAcsEventsWithRetry(companyId, device.id, {
          AcsEventCond: pagedCond,
        });
      } catch (error) {
        failureReason = (error as Error).message;
        this.logger.warn(`Attendance sync page ${pageIndex} failed: ${failureReason}`);
        status = counters.recordsReceived > 0 ? 'PARTIAL' : 'FAILED';
        break;
      }

      if (!response.ok) {
        failureReason = `Page ${pageIndex} failed with HTTP ${response.status}`;
        this.logger.warn(`Attendance sync page ${pageIndex} failed: ${failureReason}`);
        status = counters.recordsReceived > 0 ? 'PARTIAL' : 'FAILED';
        break;
      }

      const parsedPage = this.parseAcsEventPage(response.parsed);
      counters.totalMatches = Math.max(counters.totalMatches, parsedPage.totalMatches);

      const persisted = await this.persistAttendanceEvents(device, parsedPage.infoList);
      counters.recordsReceived += persisted.received;
      counters.recordsInserted += persisted.inserted;
      counters.recordsSkipped += persisted.skipped;
      counters.recordsFailed += persisted.failed;
      counters.recordsUpdated += persisted.updated;

      if (persisted.failed > 0 && status === 'SUCCESS') {
        status = 'PARTIAL';
      }

      const numOfMatches = parsedPage.numOfMatches || parsedPage.infoList.length;
      const nextCursor = cursor + numOfMatches;
      const hasMoreByStatus = parsedPage.responseStatusStrg.toUpperCase() === 'MORE';
      const hasMoreByCount =
        parsedPage.totalMatches > 0 && nextCursor < parsedPage.totalMatches;
      const shouldContinue = hasMoreByStatus || hasMoreByCount;

      if (!shouldContinue) {
        break;
      }

      if (numOfMatches <= 0) {
        failureReason =
          'Device returned MORE/remaining records but numOfMatches was 0, stopping to avoid infinite loop';
        this.logger.warn(failureReason);
        status = counters.recordsReceived > 0 ? 'PARTIAL' : 'FAILED';
        break;
      }

      cursor = nextCursor;
      pageIndex += 1;
    }

    await this.persistSyncLogSafe({
      companyId,
      deviceId: device.id,
      status,
      counters,
      startedAt: syncStartedAt,
      completedAt: new Date(),
      failureReason,
      metadata: {
        startTime: normalized.startTime ?? null,
        endTime: normalized.endTime ?? null,
        employeeNo: normalized.employeeNoString ?? null,
        maxResults: normalized.maxResults ?? 100,
      },
    });

    return {
      deviceId: device.id,
      startTime: normalized.startTime ?? null,
      endTime: normalized.endTime ?? null,
      totalMatches: counters.totalMatches,
      recordsReceived: counters.recordsReceived,
      recordsInserted: counters.recordsInserted,
      recordsSkipped: counters.recordsSkipped,
      recordsFailed: counters.recordsFailed,
      status,
    };
  }

  private async persistAttendanceEvents(
    device: DeviceLike,
    events: Record<string, unknown>[],
  ): Promise<PersistResult> {
    const counters: PersistResult = {
      received: events.length,
      inserted: 0,
      skipped: 0,
      failed: 0,
      updated: 0,
    };

    for (const event of events) {
      try {
        const mapped = this.mapEventToRow(device, event);
        const existing = await this.findExistingAttendanceLog(mapped);

        if (existing) {
          const didUpdate = await this.backfillMissingColumns(existing, mapped);
          if (didUpdate) counters.updated += 1;
          counters.skipped += 1;
          continue;
        }

        await this.attendanceLogRepository.save(
          this.attendanceLogRepository.create({
            companyId: mapped.companyId,
            branchId: mapped.branchId,
            deviceId: mapped.deviceId,
            employeeNo: mapped.employeeNo,
            employeeName: mapped.employeeName,
            cardNo: mapped.cardNo,
            eventTime: mapped.eventTime,
            major: mapped.major,
            minor: mapped.minor,
            eventType: mapped.eventType,
            attendanceStatus: mapped.attendanceStatus,
            verifyMode: mapped.verifyMode,
            doorNo: mapped.doorNo,
            cardReaderNo: mapped.cardReaderNo,
            serialNo: mapped.serialNo,
            deviceTime: mapped.deviceTime,
            remoteHostAddr: mapped.remoteHostAddr,
            netUser: mapped.netUser,
            userType: mapped.userType,
            statusValue: mapped.statusValue,
            rawPayload: mapped.rawPayload,
          }),
        );
        counters.inserted += 1;
      } catch (error) {
        if (this.isDuplicateDbError(error)) {
          counters.skipped += 1;
          continue;
        }

        counters.failed += 1;
        this.logger.warn(`Skipping failed attendance row: ${(error as Error).message}`);
      }
    }

    return counters;
  }

  private async findExistingAttendanceLog(
    mapped: MappedAttendanceRow,
  ): Promise<HikvisionAttendanceLog | null> {
    if (mapped.serialNo) {
      return this.attendanceLogRepository.findOne({
        where: {
          deviceId: mapped.deviceId,
          serialNo: mapped.serialNo,
        },
      });
    }

    return this.attendanceLogRepository.findOne({
      where: {
        deviceId: mapped.deviceId,
        employeeNo: mapped.employeeNo,
        eventTime: mapped.eventTime,
        major: mapped.major,
        minor: mapped.minor,
        doorNo: mapped.doorNo === null ? IsNull() : mapped.doorNo,
      },
    });
  }

  private async backfillMissingColumns(
    existing: HikvisionAttendanceLog,
    mapped: MappedAttendanceRow,
  ): Promise<boolean> {
    let changed = false;

    const apply = <K extends keyof HikvisionAttendanceLog>(
      key: K,
      value: HikvisionAttendanceLog[K],
      canReplace: (current: HikvisionAttendanceLog[K], next: HikvisionAttendanceLog[K]) => boolean,
    ) => {
      if (canReplace(existing[key], value)) {
        existing[key] = value;
        changed = true;
      }
    };

    const isNullish = (value: unknown) => value === null || value === undefined || value === '';
    apply('employeeName', mapped.employeeName, (current, next) => isNullish(current) && !isNullish(next));
    apply('cardNo', mapped.cardNo, (current, next) => isNullish(current) && !isNullish(next));
    apply('attendanceStatus', mapped.attendanceStatus, (current, next) => isNullish(current) && !isNullish(next));
    apply('verifyMode', mapped.verifyMode, (current, next) => isNullish(current) && !isNullish(next));
    apply('cardReaderNo', mapped.cardReaderNo, (current, next) => current === null && next !== null);
    apply('serialNo', mapped.serialNo, (current, next) => isNullish(current) && !isNullish(next));
    apply('deviceTime', mapped.deviceTime, (current, next) => current === null && next !== null);
    apply('remoteHostAddr', mapped.remoteHostAddr, (current, next) => isNullish(current) && !isNullish(next));
    apply('netUser', mapped.netUser, (current, next) => isNullish(current) && !isNullish(next));
    apply('userType', mapped.userType, (current, next) => isNullish(current) && !isNullish(next));
    apply('statusValue', mapped.statusValue, (current, next) => current === null && next !== null);
    apply('eventType', mapped.eventType, (current, next) => isNullish(current) && !isNullish(next));

    if (!changed) {
      return false;
    }

    await this.attendanceLogRepository.save(existing);
    return true;
  }

  private mapEventToRow(device: DeviceLike, item: Record<string, unknown>): MappedAttendanceRow {
    const major = this.toNullableNumber(item.major) ?? 0;
    const minor = this.toNullableNumber(item.minor) ?? 0;
    const eventTime = this.parseDateOrFail(item.time, 'time');

    return {
      companyId: device.companyId,
      branchId: device.branchId ?? null,
      deviceId: device.id,
      employeeNo: this.ensureEmployeeNo(item.employeeNoString),
      employeeName: this.toNullableString(item.name),
      cardNo: this.toNullableString(item.cardNo),
      eventTime,
      major,
      minor,
      eventType: this.mapEventType(major, minor),
      attendanceStatus: this.toAttendanceStatus(item.attendanceStatus),
      verifyMode: this.toNullableString(item.currentVerifyMode ?? item.verifyMode),
      doorNo: this.toNullableNumber(item.doorNo),
      cardReaderNo: this.toNullableNumber(item.cardReaderNo),
      serialNo: this.toNullableString(item.serialNo),
      deviceTime: this.toNullableDate(item.deviceTime ?? item.time),
      remoteHostAddr: this.toNullableString(item.remoteHostAddr),
      netUser: this.toNullableString(item.netUser),
      userType: this.toNullableString(item.userType),
      statusValue: this.toNullableNumber(item.statusValue),
      rawPayload: item,
    };
  }

  mapEventType(major: number, minor: number): string {
    if (major === 5) {
      if (minor === 38) {
        return 'VALID_FINGERPRINT_OR_CARD_OR_PASSWORD_ACCESS';
      }
      if (minor === 0) {
        return 'ACCESS_CONTROL_EVENT';
      }

      return `UNKNOWN_MINOR_${minor}`;
    }

    return `UNKNOWN_MAJOR_${major}`;
  }

  private toAttendanceStatus(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value);
    return text.trim() ? text : null;
  }

  private parseAcsEventPage(parsedPayload: Record<string, unknown> | string): ParsedAcsEventPage {
    const payload = this.toObject(parsedPayload);
    const root = this.toObject(payload.AcsEvent ?? payload);
    const rawInfoList = root.InfoList ?? root.infoList ?? [];
    const infoList = this.toObjectArray(rawInfoList);

    return {
      searchID: String(root.searchID ?? '').trim() || '1',
      responseStatusStrg: String(root.responseStatusStrg ?? root.responseStatus ?? '').trim() || 'OK',
      numOfMatches: this.toNullableNumber(root.numOfMatches) ?? infoList.length,
      totalMatches: this.toNullableNumber(root.totalMatches) ?? infoList.length,
      infoList,
      raw: root,
    };
  }

  private async normalizeCondition(
    companyId: number,
    deviceId: number,
    payload: AcsEventCondDto,
  ): Promise<AcsEventCondDto> {
    const maxResultsRaw = this.ensurePositiveInteger(payload.maxResults ?? 100, 'maxResults');
    const maxResults = await this.resolveEffectiveMaxResults(companyId, deviceId, maxResultsRaw);
    const searchResultPosition = this.ensureNonNegativeInteger(
      payload.searchResultPosition ?? 0,
      'searchResultPosition',
    );

    if (payload.startTime && payload.endTime) {
      this.ensureIsoRange(payload.startTime, payload.endTime);
    }

    return {
      searchID: buildAttendanceDeviceSearchId(payload.searchID?.trim() || 'acs_event', deviceId),
      searchResultPosition,
      maxResults,
      major: payload.major ?? 5,
      minor: payload.minor ?? 0,
      employeeNoString: payload.employeeNoString
        ? this.ensureEmployeeNo(payload.employeeNoString)
        : undefined,
      startTime: payload.startTime,
      endTime: payload.endTime,
    };
  }

  private async resolveEffectiveMaxResults(
    companyId: number,
    deviceId: number,
    requestedMaxResults: number,
  ): Promise<number> {
    const capability = await this.fetchMaxResultsCapability(companyId, deviceId);
    if (capability && capability > 0) {
      return Math.min(requestedMaxResults, capability);
    }

    return requestedMaxResults;
  }

  private async fetchMaxResultsCapability(
    companyId: number,
    deviceId: number,
  ): Promise<number | null> {
    try {
      const response = await this.hikvisionAccessControlService.getAcsEventCapabilities(
        companyId,
        deviceId,
      );

      if (!response.ok) {
        return null;
      }

      return this.resolveMaxResultsCapability(this.toObject(response.parsed));
    } catch {
      return null;
    }
  }

  private resolveMaxResultsCapability(payload: Record<string, unknown>): number | null {
    const candidates = [
      'maxResults',
      'maxSearchResults',
      'maxAcsEventSearchNum',
      'maxAcsEventNum',
      'searchMaxNum',
      'searchMaxResults',
    ];

    const value = this.findFirstNumericDeep(payload, candidates);
    if (!value || value < 1) {
      return null;
    }

    return value;
  }

  private async fetchTotalMatchesHint(
    companyId: number,
    deviceId: number,
    condition: AcsEventCondDto,
  ): Promise<number | null> {
    try {
      const response = await this.hikvisionAccessControlService.getAcsEventTotalNum(
        companyId,
        deviceId,
        { AcsEventCond: condition },
      );

      if (!response.ok) {
        return null;
      }

      const payload = this.toObject(response.parsed);
      const root = this.toObject(payload.AcsEventTotalNum ?? payload.AcsEvent ?? payload);
      const total = this.findFirstNumericDeep(root, [
        'totalNum',
        'totalMatches',
        'numOfMatches',
      ]);
      return total && total > 0 ? total : null;
    } catch {
      return null;
    }
  }

  private async requestAcsEventsWithRetry(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
    retries = 2,
  ) {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= retries) {
      try {
        return await this.hikvisionAccessControlService.searchAcsEvents(
          companyId,
          deviceId,
          payload,
        );
      } catch (error) {
        lastError = error;
        if (attempt >= retries) {
          break;
        }

        await this.sleep((attempt + 1) * 250);
      }
      attempt += 1;
    }

    throw lastError;
  }

  private async persistSyncLogSafe(input: {
    companyId: number;
    deviceId: number;
    status: AttendanceSyncStatus;
    counters: SyncAccumulator;
    startedAt: Date;
    completedAt: Date;
    failureReason: string | null;
    metadata: Record<string, unknown>;
  }) {
    try {
      await this.hikvisionSyncLogRepository.save(
        this.hikvisionSyncLogRepository.create({
          companyId: input.companyId,
          deviceId: input.deviceId,
          syncType: HikvisionSyncLogTypeEnum.ATTENDANCE,
          direction: HikvisionSyncLogDirectionEnum.PULL,
          status: this.toSyncLogStatus(input.status),
          startedAt: input.startedAt,
          completedAt: input.completedAt,
          recordsReceived: input.counters.recordsReceived,
          recordsProcessed:
            input.counters.recordsInserted +
            input.counters.recordsSkipped +
            input.counters.recordsUpdated,
          recordsCreated: input.counters.recordsInserted,
          recordsUpdated: input.counters.recordsUpdated,
          recordsFailed: input.counters.recordsFailed,
          errorMessage: input.failureReason,
          metadata: {
            ...input.metadata,
            totalMatches: input.counters.totalMatches,
            recordsSkipped: input.counters.recordsSkipped,
          },
        }),
      );
    } catch (error) {
      this.logger.warn(`Skipping hikvision_sync_logs insert: ${(error as Error).message}`);
    }
  }

  private toSyncLogStatus(status: AttendanceSyncStatus): HikvisionSyncLogStatusEnum {
    if (status === 'FAILED') return HikvisionSyncLogStatusEnum.FAILED;
    if (status === 'PARTIAL') return HikvisionSyncLogStatusEnum.PARTIAL;
    return HikvisionSyncLogStatusEnum.SUCCESS;
  }

  private async findActiveHikvisionDeviceOrFail(
    companyId: number,
    deviceId: number,
  ): Promise<AttendanceDevice> {
    return this.findHikvisionDeviceOrFail(companyId, deviceId, true);
  }

  private async findHikvisionDeviceOrFail(
    companyId: number,
    deviceId: number,
    requireActive: boolean,
  ): Promise<AttendanceDevice> {
    const device = await this.deviceRepository.findOne({
      where: { id: deviceId, companyId },
    });

    if (!device) {
      throw new NotFoundException('Hikvision device not found');
    }

    const isHikvision =
      (device.integrationType || '').toLowerCase() === 'hikvision' ||
      (device.vendorName || '').toLowerCase().includes('hikvision');
    if (!isHikvision) {
      throw new BadRequestException('Requested device is not configured as Hikvision');
    }

    if (requireActive && device.status !== AttendanceDeviceStatusEnum.ACTIVE) {
      throw new BadRequestException('Device is inactive');
    }

    return device;
  }

  private mapAttendanceLog(item: HikvisionAttendanceLog) {
    return {
      id: item.id,
      company_id: item.companyId,
      branch_id: item.branchId,
      device_id: item.deviceId,
      employee_no: item.employeeNo,
      employee_name: item.employeeName,
      card_no: item.cardNo,
      event_time: item.eventTime,
      major: item.major,
      minor: item.minor,
      event_type: item.eventType,
      attendance_status: item.attendanceStatus,
      verify_mode: item.verifyMode,
      door_no: item.doorNo,
      card_reader_no: item.cardReaderNo,
      serial_no: item.serialNo,
      device_time: item.deviceTime,
      remote_host_addr: item.remoteHostAddr,
      net_user: item.netUser,
      user_type: item.userType,
      status_value: item.statusValue,
      raw_payload: item.rawPayload,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
  }

  private ensureIsoRange(startTime: string, endTime: string) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('startTime/endTime must be valid ISO date-time values');
    }

    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('endTime must be greater than startTime');
    }
  }

  private buildDayRange(date: string, timezone: string): { startTime: string; endTime: string } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }

    const offset = this.resolveOffsetForDate(timezone, date);
    return {
      startTime: `${date}T00:00:00${offset}`,
      endTime: `${date}T23:59:59${offset}`,
    };
  }

  private resolveOffsetForDate(timezone: string, date: string): string {
    const probe = new Date(`${date}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
    }).formatToParts(probe);
    const zonePart = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT+00:00';
    const normalized = zonePart.replace('GMT', '').trim() || '+00:00';
    const match = normalized.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) {
      return '+00:00';
    }

    const sign = match[1];
    const hours = match[2].padStart(2, '0');
    const minutes = (match[3] || '00').padStart(2, '0');
    return `${sign}${hours}:${minutes}`;
  }

  private ensureValidTimeZone(timezone: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    } catch {
      throw new BadRequestException('Invalid timezone value');
    }
  }

  private ensureEmployeeNo(value: unknown): string {
    const text = String(value ?? '').trim();
    if (!text) {
      return '';
    }
    return text;
  }

  private parseDateOrFail(value: unknown, fieldName: string): Date {
    const parsed = this.toNullableDate(value);
    if (!parsed) {
      throw new BadRequestException(`Invalid or missing ${fieldName} value`);
    }
    return parsed;
  }

  private ensurePositiveInteger(value: unknown, fieldName: string): number {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 1) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }
    return num;
  }

  private ensureNonNegativeInteger(value: unknown, fieldName: string): number {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 0) {
      throw new BadRequestException(`${fieldName} must be a non-negative integer`);
    }
    return num;
  }

  private toNullableDate(value: unknown): Date | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  private toNullableString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value);
    return text.trim() ? text : null;
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private toObjectArray(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
      return value.map((item) => this.toObject(item));
    }

    if (value && typeof value === 'object') {
      return [this.toObject(value)];
    }

    return [];
  }

  private isDuplicateDbError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const err = error as QueryFailedError & { code?: string; errno?: number };
    return err.code === 'ER_DUP_ENTRY' || err.errno === 1062;
  }

  private findFirstNumericDeep(
    source: Record<string, unknown>,
    candidateKeys: string[],
  ): number | null {
    const targetKeys = new Set(candidateKeys.map((key) => key.toLowerCase()));
    const queue: unknown[] = [source];

    while (queue.length > 0) {
      const node = queue.shift();
      if (Array.isArray(node)) {
        queue.push(...node);
        continue;
      }

      if (!node || typeof node !== 'object') {
        continue;
      }

      const record = node as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (targetKeys.has(key.toLowerCase())) {
          const num = this.toNullableNumber(value);
          if (num !== null) {
            return num;
          }
        }
      }
      queue.push(...Object.values(record));
    }

    return null;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

