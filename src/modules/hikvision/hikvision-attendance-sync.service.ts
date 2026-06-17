import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { IsNull, Repository } from 'typeorm';
import {
  isDuplicateDbError,
  sleep,
  toNullableDate,
  toNullableNumber,
  toNullableString,
  toObject,
} from './helpers/hikvision-utils';
import { HikvisionHelperService } from './helpers/hikvision-helper.service';
import { SortDirection } from '../../common/dto/pagination.dto';
import { AttendanceDevice } from '../access-control/attendance-devices/entities/attendance-device.entity';
import { buildAttendanceDeviceSearchId } from '../access-control/attendance-devices/utils/attendance-device-search-id.util';
import { HikvisionSyncLog } from '../access-control/hikvision-sync-logs/entity/hikvision-sync-log.entity';
import { HikvisionSyncLogDirectionEnum } from '../access-control/hikvision-sync-logs/enum/hikvision-sync-log-direction.enum';
import { HikvisionSyncLogStatusEnum } from '../access-control/hikvision-sync-logs/enum/hikvision-sync-log-status.enum';
import { HikvisionSyncLogTypeEnum } from '../access-control/hikvision-sync-logs/enum/hikvision-sync-log-type.enum';
import { buildPaginationMeta } from '../hr/shared/hr.utils';
import { AcsEventCondDto } from './dto/acs-event-cond.dto';
import { QueryHikvisionAttendanceLogsDto } from './dto/query-hikvision-attendance-logs.dto';
import { QueryHikvisionAttendanceSyncHistoryDto } from './dto/query-hikvision-attendance-sync-history.dto';
import { HikvisionAttendanceLog } from './entities/hikvision-attendance-log.entity';
import { HikvisionAttendanceSyncJob } from './entities/hikvision-attendance-sync-job.entity';
import { HikvisionAttendanceSyncJobStatusEnum } from './enums/hikvision-attendance-sync-job-status.enum';
import { HikvisionAccessControlService } from './hikvision-access-control.service';
import {
  HIKVISION_SYNC_QUEUE,
  HikvisionSyncJobData,
  HikvisionSyncJobName,
} from './hikvision-sync-job.constants';

type AttendanceSyncStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED';
type AttendanceSyncTrigger = 'MANUAL' | 'SCHEDULED';
type AutomaticAttendanceSyncStatus = AttendanceSyncStatus | 'SKIPPED';

type SyncAccumulator = {
  totalMatches: number;
  pagesProcessed: number;
  recordsReceived: number;
  validPunchRecords: number;
  skippedSystemEvents: number;
  recordsCreated: number;
  recordsSkipped: number;
  recordsFailed: number;
  recordsUpdated: number;
};

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
  validPunchRecords: number;
  skippedSystemEvents: number;
  created: number;
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
  cardReaderKind: string | null;
  serialNo: string | null;
  deviceTime: Date | null;
  deviceNo: string | null;
  remoteHostAddr: string | null;
  netUser: string | null;
  userType: string | null;
  statusValue: number | null;
  rawPayload: Record<string, unknown>;
};

type SyncByConditionOptions = {
  trigger: AttendanceSyncTrigger;
  updateSyncCursor: boolean;
};

type AttendanceSyncByConditionResult = {
  deviceId: number;
  startTime: string | null;
  endTime: string | null;
  totalMatches: number;
  pagesProcessed: number;
  recordsReceived: number;
  validPunchRecords: number;
  skippedSystemEvents: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsFailed: number;
  status: AttendanceSyncStatus;
  errorMessage: string | null;
};

type AutomaticAttendanceSyncWindowOptions = {
  now?: Date;
  startTime?: string;
  endTime?: string;
};

@Injectable()
export class HikvisionAttendanceSyncService {
  private readonly logger = new Logger(HikvisionAttendanceSyncService.name);
  private readonly attendanceEventAttribute = 'attendance';
  private readonly attendanceMajorCode = 5;
  private readonly maxAttendancePageSize = 10;
  private readonly automaticSyncLookbackMinutes = 10;
  private readonly attendanceJobRetentionSeconds = 24 * 60 * 60;

  constructor(
    @InjectRepository(AttendanceDevice)
    private readonly deviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(HikvisionAttendanceLog)
    private readonly attendanceLogRepository: Repository<HikvisionAttendanceLog>,
    @InjectRepository(HikvisionAttendanceSyncJob)
    private readonly attendanceSyncJobRepository: Repository<HikvisionAttendanceSyncJob>,
    @InjectRepository(HikvisionSyncLog)
    private readonly hikvisionSyncLogRepository: Repository<HikvisionSyncLog>,
    @InjectQueue(HIKVISION_SYNC_QUEUE)
    private readonly hikvisionSyncQueue: Queue<HikvisionSyncJobData>,
    private readonly hikvisionAccessControlService: HikvisionAccessControlService,
    private readonly hikvisionHelper: HikvisionHelperService,
  ) {}

  async getAcsEventCapabilities(companyId: number, deviceId: number) {
    await this.hikvisionHelper.findHikvisionDeviceOrFail(companyId, deviceId, true);

    const response = await this.hikvisionAccessControlService.getAcsEventCapabilities(
      companyId,
      deviceId,
    );
    if (!response.ok) {
      throw new BadRequestException(
        `AcsEvent capabilities request failed with HTTP ${response.status}`,
      );
    }

    const parsed = toObject(response.parsed);
    return {
      deviceId,
      capabilities: parsed,
      maxResultsCapability: this.resolveMaxResultsCapability(parsed) ?? null,
      enforcedMaxResults: this.maxAttendancePageSize,
      eventAttribute: this.attendanceEventAttribute,
    };
  }

  async syncAttendanceByDate(
    companyId: number,
    deviceId: number,
    date: string,
    timezone?: string,
    maxResults = this.maxAttendancePageSize,
  ) {
    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );
    const selectedTimezone = timezone?.trim() || device.timezone || 'UTC';
    this.ensureValidTimeZone(selectedTimezone);

    const { startTime, endTime } = this.buildDayRange(date, selectedTimezone);
    return this.syncAttendanceByRange(
      companyId,
      deviceId,
      startTime,
      endTime,
      maxResults,
    );
  }

  async queueAttendanceSyncByDate(
    companyId: number,
    deviceId: number,
    date: string,
    timezone?: string,
    maxResults = this.maxAttendancePageSize,
    requestedByUserId: number | null = null,
    requestedByCompanyUserId: number | null = null,
  ) {
    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );
    const selectedTimezone = timezone?.trim() || device.timezone || 'UTC';
    this.ensureValidTimeZone(selectedTimezone);

    const { startTime, endTime } = this.buildDayRange(date, selectedTimezone);
    return this.queueAttendanceSyncByRange(
      companyId,
      deviceId,
      startTime,
      endTime,
      maxResults,
      requestedByUserId,
      requestedByCompanyUserId,
    );
  }

  async syncAttendanceByRange(
    companyId: number,
    deviceId: number,
    startTime: string,
    endTime: string,
    maxResults = this.maxAttendancePageSize,
  ) {
    this.ensureIsoRange(startTime, endTime);

    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );
    const effectiveMaxResults = await this.resolveEffectiveMaxResults(
      companyId,
      deviceId,
      this.ensurePositiveInteger(maxResults, 'maxResults'),
    );

    return this.syncByCondition(
      companyId,
      device,
      {
        searchID: 'attendance_sync',
        searchResultPosition: 0,
        maxResults: effectiveMaxResults,
        major: this.attendanceMajorCode,
        minor: 0,
        startTime,
        endTime,
      },
      {
        trigger: 'MANUAL',
        updateSyncCursor: true,
      },
    );
  }

  async queueAttendanceSyncByRange(
    companyId: number,
    deviceId: number,
    startTime: string,
    endTime: string,
    maxResults = this.maxAttendancePageSize,
    requestedByUserId: number | null = null,
    requestedByCompanyUserId: number | null = null,
  ) {
    this.ensureIsoRange(startTime, endTime);
    await this.hikvisionHelper.findHikvisionDeviceOrFail(companyId, deviceId, true);

    const normalizedMaxResults = this.ensurePositiveInteger(
      maxResults,
      'maxResults',
    );
    const activeJobKey = this.buildAttendanceSyncJobKey(companyId, deviceId);

    const existingActiveJob = await this.findActiveAttendanceSyncJob(
      companyId,
      deviceId,
    );
    if (existingActiveJob) {
      return {
        message: 'Attendance sync is already in progress for this device',
        sync_started: false,
        job: this.mapAttendanceSyncJob(existingActiveJob),
      };
    }

    let syncJob: HikvisionAttendanceSyncJob;
    try {
      syncJob = await this.attendanceSyncJobRepository.save(
        this.attendanceSyncJobRepository.create({
          companyId,
          deviceId,
          activeJobKey,
          status: HikvisionAttendanceSyncJobStatusEnum.PENDING,
          syncStartTime: startTime,
          syncEndTime: endTime,
          requestedByUserId,
          requestedByCompanyUserId,
          totalRecordsPulled: 0,
          totalRecordsSaved: 0,
          metadata: {
            maxResults: normalizedMaxResults,
          },
        }),
      );
    } catch (error) {
      if (isDuplicateDbError(error)) {
        const duplicateJob = await this.findActiveAttendanceSyncJob(
          companyId,
          deviceId,
        );
        if (duplicateJob) {
          return {
            message: 'Attendance sync is already in progress for this device',
            sync_started: false,
            job: this.mapAttendanceSyncJob(duplicateJob),
          };
        }

        throw new ConflictException(
          'Attendance sync is already in progress for this device',
        );
      }

      throw error;
    }

    try {
      const queuedJob = await this.hikvisionSyncQueue.add(
        HikvisionSyncJobName.SYNC_ATTENDANCE,
        {
          companyId,
          deviceId,
          requestedByUserId,
          requestedByCompanyUserId,
          requestedAt: new Date().toISOString(),
          attendanceSyncJobId: syncJob.id,
          attendanceStartTime: startTime,
          attendanceEndTime: endTime,
          attendanceMaxResults: normalizedMaxResults,
        },
        {
          jobId: this.buildAttendanceSyncQueueJobId(
            companyId,
            deviceId,
            syncJob.id,
          ),
          attempts: 1,
          removeOnComplete: {
            age: this.attendanceJobRetentionSeconds,
            count: 1000,
          },
          removeOnFail: {
            age: 7 * this.attendanceJobRetentionSeconds,
            count: 1000,
          },
        },
      );

      syncJob.queueJobId = String(queuedJob.id);
      syncJob = await this.attendanceSyncJobRepository.save(syncJob);
    } catch (error) {
      await this.attendanceSyncJobRepository.save({
        id: syncJob.id,
        activeJobKey: null,
        status: HikvisionAttendanceSyncJobStatusEnum.FAILED,
        queueJobId: null,
        completedAt: new Date(),
        errorMessage: (error as Error).message,
      });
      throw error;
    }

    return {
      message: 'Attendance sync started successfully',
      sync_started: true,
      job: this.mapAttendanceSyncJob(syncJob),
    };
  }

  async syncAttendanceByEmployee(
    companyId: number,
    deviceId: number,
    employeeNo: string,
    startTime: string,
    endTime: string,
    maxResults = this.maxAttendancePageSize,
  ) {
    this.ensureIsoRange(startTime, endTime);
    const normalizedEmployeeNo = this.ensureEmployeeNo(employeeNo);

    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );
    const effectiveMaxResults = await this.resolveEffectiveMaxResults(
      companyId,
      deviceId,
      this.ensurePositiveInteger(maxResults, 'maxResults'),
    );

    return this.syncByCondition(
      companyId,
      device,
      {
        searchID: buildAttendanceDeviceSearchId(
          'attendance_sync_employee',
          deviceId,
          normalizedEmployeeNo,
        ),
        searchResultPosition: 0,
        maxResults: effectiveMaxResults,
        major: this.attendanceMajorCode,
        minor: 0,
        employeeNoString: normalizedEmployeeNo,
        startTime,
        endTime,
      },
      {
        trigger: 'MANUAL',
        updateSyncCursor: false,
      },
    );
  }

  async syncLatestAttendanceWindow(
    companyId: number,
    deviceId: number,
    options: AutomaticAttendanceSyncWindowOptions = {},
  ): Promise<
    | {
        deviceId: number;
        status: AutomaticAttendanceSyncStatus;
        reason: string;
      }
    | {
        deviceId: number;
        startTime: string | null;
        endTime: string | null;
        totalMatches: number;
        pagesProcessed: number;
        recordsReceived: number;
        recordsCreated: number;
        recordsUpdated: number;
        recordsSkipped: number;
        recordsFailed: number;
        status: AttendanceSyncStatus;
      }
  > {
    const { now = new Date(), startTime, endTime } = options;
    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );
    const syncRange = this.buildAutomaticSyncRange(device, now, {
      startTime,
      endTime,
    });

    if (!syncRange) {
      return {
        deviceId: device.id,
        status: 'SKIPPED',
        reason: 'No new attendance window is available to sync',
      };
    }

    return this.syncByCondition(
      companyId,
      device,
      {
        searchID: 'attendance_sync',
        searchResultPosition: 0,
        maxResults: this.maxAttendancePageSize,
        major: this.attendanceMajorCode,
        minor: 0,
        startTime: syncRange.startTime,
        endTime: syncRange.endTime,
      },
      {
        trigger: 'SCHEDULED',
        updateSyncCursor: true,
      },
    );
  }

  async pullAttendancePage(
    companyId: number,
    deviceId: number,
    payload: AcsEventCondDto,
  ) {
    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );
    const normalized = await this.normalizeCondition(
      companyId,
      deviceId,
      payload,
    );

    const response = await this.requestAcsEventsWithRetry(companyId, deviceId, {
      AcsEventCond: normalized,
    });
    if (!response.ok) {
      throw new BadRequestException(
        `AcsEvent request failed with HTTP ${response.status}`,
      );
    }

    const parsedPage = this.parseAcsEventPage(response.parsed);
    const persisted = await this.persistAttendanceEvents(
      device,
      parsedPage.infoList,
    );

    return {
      deviceId,
      searchID: parsedPage.searchID,
      searchResultPosition: normalized.searchResultPosition ?? 0,
      maxResults: normalized.maxResults ?? this.maxAttendancePageSize,
      totalMatches: parsedPage.totalMatches,
      pagesProcessed: 1,
      responseStatusStrg: parsedPage.responseStatusStrg,
      numOfMatches: parsedPage.numOfMatches,
      recordsReceived: persisted.received,
      validPunchRecords: persisted.validPunchRecords,
      skippedSystemEvents: persisted.skippedSystemEvents,
      recordsCreated: persisted.created,
      recordsUpdated: persisted.updated,
      recordsSkipped: persisted.skipped,
      recordsFailed: persisted.failed,
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
      await this.hikvisionHelper.findHikvisionDeviceOrFail(companyId, device_id);
    }

    const qb = this.attendanceLogRepository
      .createQueryBuilder('log')
      .where('log.company_id = :companyId', { companyId });

    if (device_id)
      qb.andWhere('log.device_id = :deviceId', { deviceId: device_id });
    if (employee_no?.trim()) {
      qb.andWhere('log.employee_no = :employeeNo', {
        employeeNo: employee_no.trim(),
      });
    }
    if (major !== undefined) qb.andWhere('log.major = :major', { major });
    if (minor !== undefined) qb.andWhere('log.minor = :minor', { minor });
    if (door_no !== undefined)
      qb.andWhere('log.door_no = :doorNo', { doorNo: door_no });
    if (serial_no?.trim())
      qb.andWhere('log.serial_no = :serialNo', { serialNo: serial_no.trim() });
    if (start_time)
      qb.andWhere('log.event_time >= :startTime', {
        startTime: new Date(start_time),
      });
    if (end_time)
      qb.andWhere('log.event_time <= :endTime', {
        endTime: new Date(end_time),
      });

    const sortableColumns = new Set([
      'created_at',
      'event_time',
      'employee_no',
      'major',
      'minor',
    ]);
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

  async findSyncHistory(
    companyId: number,
    deviceId: number,
    query: QueryHikvisionAttendanceSyncHistoryDto,
  ) {
    await this.hikvisionHelper.findHikvisionDeviceOrFail(companyId, deviceId);

    const {
      page = 1,
      limit = 20,
      sortBy = 'started_at',
      sortOrder = SortDirection.DESC,
      status,
      from_date,
      to_date,
    } = query;

    const qb = this.hikvisionSyncLogRepository
      .createQueryBuilder('syncLog')
      .where('syncLog.company_id = :companyId', { companyId })
      .andWhere('syncLog.device_id = :deviceId', { deviceId })
      .andWhere('syncLog.sync_type = :syncType', {
        syncType: HikvisionSyncLogTypeEnum.ATTENDANCE,
      })
      .andWhere('syncLog.direction = :direction', {
        direction: HikvisionSyncLogDirectionEnum.PULL,
      });

    if (status) {
      qb.andWhere('syncLog.status = :status', { status });
    }

    if (from_date) {
      qb.andWhere('syncLog.started_at >= :fromDate', {
        fromDate: new Date(from_date),
      });
    }

    if (to_date) {
      qb.andWhere('syncLog.started_at <= :toDate', {
        toDate: new Date(to_date),
      });
    }

    const allowedSortFields = new Set([
      'started_at',
      'completed_at',
      'created_at',
      'status',
    ]);
    const safeSortBy = allowedSortFields.has(sortBy) ? sortBy : 'started_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb
      .orderBy(`syncLog.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      device_id: deviceId,
      data: items.map((item) => this.mapSyncHistory(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async getLatestAttendanceSyncStatus(companyId: number, deviceId: number) {
    await this.hikvisionHelper.findHikvisionDeviceOrFail(companyId, deviceId);

    const job = await this.attendanceSyncJobRepository.findOne({
      where: { companyId, deviceId },
      order: { createdAt: 'DESC' },
    });

    if (!job) {
      throw new NotFoundException(
        'Attendance sync status not found for this device',
      );
    }

    return this.mapAttendanceSyncJob(job);
  }

  async runQueuedAttendanceSync(jobData: HikvisionSyncJobData) {
    if (!jobData.attendanceSyncJobId) {
      throw new BadRequestException(
        'Attendance sync job payload is missing attendanceSyncJobId',
      );
    }

    const syncJob = await this.attendanceSyncJobRepository.findOne({
      where: { id: jobData.attendanceSyncJobId, companyId: jobData.companyId },
    });

    if (!syncJob) {
      throw new NotFoundException('Attendance sync job record not found');
    }

    if (!jobData.attendanceStartTime || !jobData.attendanceEndTime) {
      await this.failAttendanceSyncJob(
        syncJob.id,
        'Attendance sync range is missing',
      );
      throw new BadRequestException('Attendance sync range is missing');
    }

    await this.attendanceSyncJobRepository.save({
      id: syncJob.id,
      status: HikvisionAttendanceSyncJobStatusEnum.RUNNING,
      startedAt: new Date(),
      errorMessage: null,
    });

    try {
      const result = await this.syncAttendanceByRange(
        jobData.companyId,
        jobData.deviceId,
        jobData.attendanceStartTime,
        jobData.attendanceEndTime,
        jobData.attendanceMaxResults ?? this.maxAttendancePageSize,
      );

      const totalRecordsSaved = result.recordsCreated + result.recordsUpdated;
      if (result.status === 'FAILED') {
        await this.attendanceSyncJobRepository.save({
          id: syncJob.id,
          activeJobKey: null,
          status: HikvisionAttendanceSyncJobStatusEnum.FAILED,
          resultStatus: result.status,
          completedAt: new Date(),
          totalRecordsPulled: result.recordsReceived,
          totalRecordsSaved,
          errorMessage: result.errorMessage || 'Attendance sync failed',
          metadata: {
            ...toObject(syncJob.metadata),
            totalMatches: result.totalMatches,
            pagesProcessed: result.pagesProcessed,
            validPunchRecords: result.validPunchRecords,
            skippedSystemEvents: result.skippedSystemEvents,
            recordsCreated: result.recordsCreated,
            recordsUpdated: result.recordsUpdated,
            recordsSkipped: result.recordsSkipped,
            recordsFailed: result.recordsFailed,
          },
        });
        throw new Error(result.errorMessage || 'Attendance sync failed');
      }

      await this.attendanceSyncJobRepository.save({
        id: syncJob.id,
        activeJobKey: null,
        status: HikvisionAttendanceSyncJobStatusEnum.COMPLETED,
        resultStatus: result.status,
        completedAt: new Date(),
        totalRecordsPulled: result.recordsReceived,
        totalRecordsSaved,
        errorMessage: result.errorMessage,
        metadata: {
          ...toObject(syncJob.metadata),
          totalMatches: result.totalMatches,
          pagesProcessed: result.pagesProcessed,
          validPunchRecords: result.validPunchRecords,
          skippedSystemEvents: result.skippedSystemEvents,
          recordsCreated: result.recordsCreated,
          recordsUpdated: result.recordsUpdated,
          recordsSkipped: result.recordsSkipped,
          recordsFailed: result.recordsFailed,
        },
      });

      return {
        sync_job_id: syncJob.id,
        status: HikvisionAttendanceSyncJobStatusEnum.COMPLETED,
        result_status: result.status,
        total_records_pulled: result.recordsReceived,
        total_records_saved: totalRecordsSaved,
        valid_punch_records: result.validPunchRecords,
        skipped_system_events: result.skippedSystemEvents,
      };
    } catch (error) {
      await this.failAttendanceSyncJob(syncJob.id, (error as Error).message);
      throw error;
    }
  }

  private async syncByCondition(
    companyId: number,
    device: AttendanceDevice,
    condition: AcsEventCondDto,
    options: SyncByConditionOptions,
  ): Promise<AttendanceSyncByConditionResult> {
    const normalized = await this.normalizeCondition(
      companyId,
      device.id,
      condition,
    );
    const syncStartedAt = new Date();
    const counters: SyncAccumulator = {
      totalMatches: 0,
      pagesProcessed: 0,
      recordsReceived: 0,
      validPunchRecords: 0,
      skippedSystemEvents: 0,
      recordsCreated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      recordsUpdated: 0,
    };

    let status: AttendanceSyncStatus = 'SUCCESS';
    let cursor = normalized.searchResultPosition ?? 0;
    let pageNumber = 1;
    let failureReason: string | null = null;

    const totalNumHint = await this.fetchTotalMatchesHint(
      companyId,
      device.id,
      normalized,
    );
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
        this.logger.warn(
          `Attendance sync page ${pageNumber} failed: ${failureReason}`,
        );
        status = counters.recordsReceived > 0 ? 'PARTIAL' : 'FAILED';
        break;
      }

      if (!response.ok) {
        failureReason = `Page ${pageNumber} failed with HTTP ${response.status}`;
        this.logger.warn(
          `Attendance sync page ${pageNumber} failed: ${failureReason}`,
        );
        status = counters.recordsReceived > 0 ? 'PARTIAL' : 'FAILED';
        break;
      }

      const parsedPage = this.parseAcsEventPage(response.parsed);
      counters.totalMatches = Math.max(
        counters.totalMatches,
        parsedPage.totalMatches,
      );

      const persisted = await this.persistAttendanceEvents(
        device,
        parsedPage.infoList,
      );
      counters.pagesProcessed += 1;
      counters.recordsReceived += persisted.received;
      counters.validPunchRecords += persisted.validPunchRecords;
      counters.skippedSystemEvents += persisted.skippedSystemEvents;
      counters.recordsCreated += persisted.created;
      counters.recordsSkipped += persisted.skipped;
      counters.recordsFailed += persisted.failed;
      counters.recordsUpdated += persisted.updated;

      if (persisted.failed > 0 && status === 'SUCCESS') {
        status = 'PARTIAL';
      }

      const numOfMatches =
        parsedPage.numOfMatches || parsedPage.infoList.length;
      const nextCursor = cursor + numOfMatches;
      const stopByStatus =
        parsedPage.responseStatusStrg.toUpperCase() !== 'MORE';
      const stopByTotal =
        parsedPage.totalMatches > 0 && nextCursor >= parsedPage.totalMatches;
      const stopByReceived =
        counters.totalMatches > 0 &&
        counters.recordsReceived >= counters.totalMatches;

      if (stopByStatus || stopByTotal || stopByReceived) {
        break;
      }

      if (numOfMatches <= 0) {
        failureReason =
          'Device returned MORE while numOfMatches was 0, stopping to avoid an infinite pagination loop';
        this.logger.warn(failureReason);
        status = counters.recordsReceived > 0 ? 'PARTIAL' : 'FAILED';
        break;
      }

      cursor = nextCursor;
      pageNumber += 1;
    }

    if (
      status === 'SUCCESS' &&
      options.updateSyncCursor &&
      normalized.endTime
    ) {
      try {
        await this.markDeviceAttendanceSynced(device, normalized.endTime);
      } catch (error) {
        failureReason =
          failureReason ||
          `Attendance records were saved, but last_sync_at could not be updated: ${(error as Error).message}`;
        status = 'PARTIAL';
      }
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
        trigger: options.trigger,
        searchID: normalized.searchID ?? null,
        startTime: normalized.startTime ?? null,
        endTime: normalized.endTime ?? null,
        employeeNo: normalized.employeeNoString ?? null,
        eventAttribute:
          normalized.eventAttribute ?? this.attendanceEventAttribute,
        maxResults: normalized.maxResults ?? this.maxAttendancePageSize,
      },
    });

    return {
      deviceId: device.id,
      startTime: normalized.startTime ?? null,
      endTime: normalized.endTime ?? null,
      totalMatches: counters.totalMatches,
      pagesProcessed: counters.pagesProcessed,
      recordsReceived: counters.recordsReceived,
      validPunchRecords: counters.validPunchRecords,
      skippedSystemEvents: counters.skippedSystemEvents,
      recordsCreated: counters.recordsCreated,
      recordsUpdated: counters.recordsUpdated,
      recordsSkipped: counters.recordsSkipped,
      recordsFailed: counters.recordsFailed,
      status,
      errorMessage: failureReason,
    };
  }

  private async persistAttendanceEvents(
    device: AttendanceDevice,
    events: Record<string, unknown>[],
  ): Promise<PersistResult> {
    const counters: PersistResult = {
      received: events.length,
      validPunchRecords: 0,
      skippedSystemEvents: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      updated: 0,
    };

    for (const event of events) {
      try {
        if (!this.isValidPunchEvent(event)) {
          counters.skippedSystemEvents += 1;
          continue;
        }

        counters.validPunchRecords += 1;
        const mapped = this.mapEventToRow(device, event);
        const existing = await this.findExistingAttendanceLog(mapped);

        if (existing) {
          const didUpdate = await this.applyAttendanceLogChanges(
            existing,
            mapped,
          );
          if (didUpdate) {
            counters.updated += 1;
          } else {
            counters.skipped += 1;
          }
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
            cardReaderKind: mapped.cardReaderKind,
            serialNo: mapped.serialNo,
            deviceTime: mapped.deviceTime,
            deviceNo: mapped.deviceNo,
            remoteHostAddr: mapped.remoteHostAddr,
            netUser: mapped.netUser,
            userType: mapped.userType,
            statusValue: mapped.statusValue,
            rawPayload: mapped.rawPayload,
          }),
        );
        counters.created += 1;
      } catch (error) {
        if (isDuplicateDbError(error)) {
          counters.skipped += 1;
          continue;
        }

        counters.failed += 1;
        this.logger.warn(
          `Skipping failed attendance row: ${(error as Error).message}`,
        );
      }
    }

    return counters;
  }

  private async findExistingAttendanceLog(
    mapped: MappedAttendanceRow,
  ): Promise<HikvisionAttendanceLog | null> {
    return this.attendanceLogRepository.findOne({
      where: {
        deviceId: mapped.deviceId,
        employeeNo: mapped.employeeNo,
        eventTime: mapped.eventTime,
        major: mapped.major,
        minor: mapped.minor,
        cardReaderNo:
          mapped.cardReaderNo === null ? IsNull() : mapped.cardReaderNo,
        doorNo: mapped.doorNo === null ? IsNull() : mapped.doorNo,
      },
    });
  }

  private async applyAttendanceLogChanges(
    existing: HikvisionAttendanceLog,
    mapped: MappedAttendanceRow,
  ): Promise<boolean> {
    let changed = false;

    const applyString = <K extends keyof HikvisionAttendanceLog>(
      key: K,
      value: string | null,
      options: { onlyWhenMissing?: boolean } = {},
    ) => {
      if (!value) {
        return;
      }

      const current = existing[key];
      const currentValue =
        typeof current === 'string' ? current.trim() : current;
      if (options.onlyWhenMissing) {
        if (
          currentValue === null ||
          currentValue === undefined ||
          currentValue === ''
        ) {
          existing[key] = value as HikvisionAttendanceLog[K];
          changed = true;
        }
        return;
      }

      if (currentValue !== value) {
        existing[key] = value as HikvisionAttendanceLog[K];
        changed = true;
      }
    };

    const applyNumber = <K extends keyof HikvisionAttendanceLog>(
      key: K,
      value: number | null,
      options: { onlyWhenMissing?: boolean } = {},
    ) => {
      if (value === null || value === undefined) {
        return;
      }

      const current = existing[key];
      if (options.onlyWhenMissing) {
        if (current === null || current === undefined) {
          existing[key] = value as HikvisionAttendanceLog[K];
          changed = true;
        }
        return;
      }

      if (current !== value) {
        existing[key] = value as HikvisionAttendanceLog[K];
        changed = true;
      }
    };

    const applyDate = <K extends keyof HikvisionAttendanceLog>(
      key: K,
      value: Date | null,
      options: { onlyWhenMissing?: boolean } = {},
    ) => {
      if (!value) {
        return;
      }

      const current = existing[key];
      const currentTime = current instanceof Date ? current.getTime() : null;
      if (options.onlyWhenMissing) {
        if (currentTime === null) {
          existing[key] = value as HikvisionAttendanceLog[K];
          changed = true;
        }
        return;
      }

      if (currentTime !== value.getTime()) {
        existing[key] = value as HikvisionAttendanceLog[K];
        changed = true;
      }
    };

    applyString('employeeName', mapped.employeeName);
    applyString('cardNo', mapped.cardNo);
    applyString('attendanceStatus', mapped.attendanceStatus);
    applyString('verifyMode', mapped.verifyMode);
    applyString('cardReaderKind', mapped.cardReaderKind);
    applyString('serialNo', mapped.serialNo, { onlyWhenMissing: true });
    applyString('deviceNo', mapped.deviceNo);
    applyString('remoteHostAddr', mapped.remoteHostAddr);
    applyString('netUser', mapped.netUser);
    applyString('userType', mapped.userType);
    applyString('eventType', mapped.eventType);
    applyString('employeeNo', mapped.employeeNo, { onlyWhenMissing: true });
    applyNumber('doorNo', mapped.doorNo);
    applyNumber('cardReaderNo', mapped.cardReaderNo);
    applyNumber('statusValue', mapped.statusValue);
    applyDate('deviceTime', mapped.deviceTime);

    const existingPayload = JSON.stringify(existing.rawPayload ?? {});
    const nextPayload = JSON.stringify(mapped.rawPayload ?? {});
    if (existingPayload !== nextPayload) {
      existing.rawPayload = mapped.rawPayload;
      changed = true;
    }

    if (!changed) {
      return false;
    }

    await this.attendanceLogRepository.save(existing);
    return true;
  }

  private mapEventToRow(
    device: AttendanceDevice,
    item: Record<string, unknown>,
  ): MappedAttendanceRow {
    const major = toNullableNumber(item.major) ?? this.attendanceMajorCode;
    const minor = toNullableNumber(item.minor) ?? 0;
    const eventTime = this.parseDateOrFail(item.time, 'time');

    return {
      companyId: device.companyId,
      branchId: device.branchId ?? null,
      deviceId: device.id,
      employeeNo: this.resolveAttendanceEmployeeNo(item),
      employeeName: toNullableString(item.name ?? item.employeeName),
      cardNo: toNullableString(item.cardNo),
      eventTime,
      major,
      minor,
      eventType: this.mapEventType(major, minor),
      attendanceStatus: this.toAttendanceStatus(item.attendanceStatus),
      verifyMode: toNullableString(
        item.currentVerifyMode ?? item.verifyMode,
      ),
      doorNo: toNullableNumber(item.doorNo),
      cardReaderNo: toNullableNumber(item.cardReaderNo),
      cardReaderKind: toNullableString(item.cardReaderKind),
      serialNo: toNullableString(item.serialNo),
      deviceTime: toNullableDate(item.deviceTime ?? item.time),
      deviceNo: toNullableString(item.deviceNo),
      remoteHostAddr: toNullableString(item.remoteHostAddr),
      netUser: toNullableString(item.netUser),
      userType: toNullableString(item.userType),
      statusValue: toNullableNumber(item.statusValue),
      rawPayload: item,
    };
  }

  private isValidPunchEvent(item: Record<string, unknown>): boolean {
    const eventTime = toNullableDate(item.time);
    const major = toNullableNumber(item.major);

    return Boolean(
      eventTime && (major === null || major === this.attendanceMajorCode),
    );
  }

  private resolveAttendanceEmployeeNo(item: Record<string, unknown>): string {
    const candidates = [
      item.employeeNoString,
      item.employeeNo,
      item.empNo,
      item.employee_id,
      item.employeeId,
    ];

    for (const candidate of candidates) {
      const value = this.ensureEmployeeNo(candidate);
      if (value) {
        return value;
      }
    }

    return '';
  }

  private mapEventType(major: number, minor: number): string {
    if (major === this.attendanceMajorCode) {
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
    if (value === null || value === undefined) {
      return null;
    }

    const text = String(value);
    return text.trim() ? text : null;
  }

  private parseAcsEventPage(
    parsedPayload: Record<string, unknown> | string,
  ): ParsedAcsEventPage {
    const payload = toObject(parsedPayload);
    const root = toObject(
      payload.AcsEventSearchResult ?? payload.AcsEvent ?? payload,
    );
    const rawInfoList =
      root.InfoList ?? root.infoList ?? root.MatchList ?? root.matchList ?? [];
    const infoList = this.toObjectArray(rawInfoList);

    return {
      searchID: String(root.searchID ?? '').trim() || 'attendance_sync',
      responseStatusStrg:
        String(root.responseStatusStrg ?? root.responseStatus ?? '').trim() ||
        'OK',
      numOfMatches: toNullableNumber(root.numOfMatches) ?? infoList.length,
      totalMatches: toNullableNumber(root.totalMatches) ?? infoList.length,
      infoList,
      raw: root,
    };
  }

  private async normalizeCondition(
    companyId: number,
    deviceId: number,
    payload: AcsEventCondDto,
  ): Promise<AcsEventCondDto> {
    if (
      payload.eventAttribute &&
      payload.eventAttribute.trim().toLowerCase() !==
        this.attendanceEventAttribute
    ) {
      throw new BadRequestException(
        'Only eventAttribute="attendance" is supported for this sync',
      );
    }

    const maxResultsRaw = this.ensurePositiveInteger(
      payload.maxResults ?? this.maxAttendancePageSize,
      'maxResults',
    );
    const maxResults = await this.resolveEffectiveMaxResults(
      companyId,
      deviceId,
      maxResultsRaw,
    );
    const searchResultPosition = this.ensureNonNegativeInteger(
      payload.searchResultPosition ?? 0,
      'searchResultPosition',
    );

    if (payload.startTime && payload.endTime) {
      this.ensureIsoRange(payload.startTime, payload.endTime);
    }

    return {
      searchID: buildAttendanceDeviceSearchId(
        payload.searchID?.trim() || 'attendance_sync',
        deviceId,
      ),
      searchResultPosition,
      maxResults,
      major: this.attendanceMajorCode,
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
    const capability = await this.fetchMaxResultsCapability(
      companyId,
      deviceId,
    );
    const limits = [requestedMaxResults, this.maxAttendancePageSize];
    if (capability && capability > 0) {
      limits.push(capability);
    }

    return Math.min(...limits);
  }

  private async fetchMaxResultsCapability(
    companyId: number,
    deviceId: number,
  ): Promise<number | null> {
    try {
      const response =
        await this.hikvisionAccessControlService.getAcsEventCapabilities(
          companyId,
          deviceId,
        );

      if (!response.ok) {
        return null;
      }

      return this.resolveMaxResultsCapability(toObject(response.parsed));
    } catch {
      return null;
    }
  }

  private resolveMaxResultsCapability(
    payload: Record<string, unknown>,
  ): number | null {
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

      const payload = toObject(response.parsed);
      const root = toObject(
        payload.AcsEventTotalNum ?? payload.AcsEvent ?? payload,
      );
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

        await sleep((attempt + 1) * 250);
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
            input.counters.recordsCreated +
            input.counters.recordsUpdated +
            input.counters.recordsSkipped,
          recordsCreated: input.counters.recordsCreated,
          recordsUpdated: input.counters.recordsUpdated,
          recordsFailed: input.counters.recordsFailed,
          errorMessage: input.failureReason,
          metadata: {
            ...input.metadata,
            totalMatches: input.counters.totalMatches,
            pagesProcessed: input.counters.pagesProcessed,
            validPunchRecords: input.counters.validPunchRecords,
            skippedSystemEvents: input.counters.skippedSystemEvents,
            recordsSkipped: input.counters.recordsSkipped,
          },
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Skipping hikvision_sync_logs insert: ${(error as Error).message}`,
      );
    }
  }

  private toSyncLogStatus(
    status: AttendanceSyncStatus,
  ): HikvisionSyncLogStatusEnum {
    if (status === 'FAILED') return HikvisionSyncLogStatusEnum.FAILED;
    if (status === 'PARTIAL') return HikvisionSyncLogStatusEnum.PARTIAL;
    return HikvisionSyncLogStatusEnum.SUCCESS;
  }

  private async markDeviceAttendanceSynced(
    device: AttendanceDevice,
    syncedThrough: string,
  ): Promise<void> {
    const syncedAt = this.parseDateOrFail(syncedThrough, 'endTime');
    const currentAttendanceSyncAt = this.extractAttendanceLastSyncAt(device);

    if (
      currentAttendanceSyncAt &&
      syncedAt.getTime() <= currentAttendanceSyncAt.getTime()
    ) {
      return;
    }

    const metadata = toObject(device.metadata);
    const hikvision = toObject(metadata.hikvision);
    const attendance = toObject(hikvision.attendance);

    device.lastSyncAt = syncedAt;
    device.metadata = {
      ...metadata,
      hikvision: {
        ...hikvision,
        attendance: {
          ...attendance,
          last_sync_at: syncedAt.toISOString(),
        },
      },
    };

    await this.deviceRepository.save(device);
  }

  private buildAutomaticSyncRange(
    device: AttendanceDevice,
    now: Date,
    options: Pick<
      AutomaticAttendanceSyncWindowOptions,
      'startTime' | 'endTime'
    > = {},
  ): { startTime: string; endTime: string } | null {
    const selectedTimezone = device.timezone?.trim() || 'UTC';
    this.ensureValidTimeZone(selectedTimezone);

    const rangeStartLimit = this.parseOptionalDateOrFail(
      options.startTime,
      'automatic attendance sync startTime',
    );
    const rangeEndLimit = this.parseOptionalDateOrFail(
      options.endTime,
      'automatic attendance sync endTime',
    );

    if (
      rangeStartLimit &&
      rangeEndLimit &&
      rangeEndLimit.getTime() <= rangeStartLimit.getTime()
    ) {
      throw new BadRequestException(
        'automatic attendance sync endTime must be greater than startTime',
      );
    }

    const endAt =
      rangeEndLimit && rangeEndLimit.getTime() < now.getTime()
        ? new Date(rangeEndLimit)
        : new Date(now);
    const lastAttendanceSyncAt = this.extractAttendanceLastSyncAt(device);
    let startAt =
      lastAttendanceSyncAt ??
      new Date(endAt.getTime() - this.automaticSyncLookbackMinutes * 60 * 1000);

    if (rangeStartLimit && startAt.getTime() < rangeStartLimit.getTime()) {
      startAt = new Date(rangeStartLimit);
    }

    if (endAt.getTime() <= startAt.getTime()) {
      return null;
    }

    return {
      startTime: this.formatDateForDevice(startAt, selectedTimezone),
      endTime: this.formatDateForDevice(endAt, selectedTimezone),
    };
  }

  private extractAttendanceLastSyncAt(device: AttendanceDevice): Date | null {
    const metadata = toObject(device.metadata);
    const hikvision = toObject(metadata.hikvision);
    const attendance = toObject(hikvision.attendance);

    return toNullableDate(attendance.last_sync_at) ?? null;
  }

  private formatDateForDevice(date: Date, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
    const month = parts.find((part) => part.type === 'month')?.value ?? '01';
    const day = parts.find((part) => part.type === 'day')?.value ?? '01';
    const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
    const second = parts.find((part) => part.type === 'second')?.value ?? '00';
    const datePart = `${year}-${month}-${day}`;
    const offset = this.resolveOffsetForDate(timezone, datePart);

    return `${datePart}T${hour}:${minute}:${second}${offset}`;
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
      card_reader_kind: item.cardReaderKind,
      serial_no: item.serialNo,
      device_time: item.deviceTime,
      device_no: item.deviceNo,
      remote_host_addr: item.remoteHostAddr,
      net_user: item.netUser,
      user_type: item.userType,
      status_value: item.statusValue,
      processing_status: item.processingStatus,
      processing_attempts: item.processingAttempts,
      processed_at: item.processedAt,
      last_processing_error: item.lastProcessingError,
      raw_payload: item.rawPayload,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
  }

  private mapSyncHistory(item: HikvisionSyncLog) {
    const metadata = toObject(item.metadata);

    return {
      id: item.id,
      company_id: item.companyId,
      device_id: item.deviceId,
      sync_type: item.syncType,
      direction: item.direction,
      status: item.status,
      started_at: item.startedAt,
      completed_at: item.completedAt,
      records_received: item.recordsReceived,
      records_processed: item.recordsProcessed,
      records_created: item.recordsCreated,
      records_updated: item.recordsUpdated,
      valid_punch_records:
        toNullableNumber(metadata.validPunchRecords) ?? 0,
      skipped_system_events:
        toNullableNumber(metadata.skippedSystemEvents) ?? 0,
      records_failed: item.recordsFailed,
      records_skipped: toNullableNumber(metadata.recordsSkipped) ?? 0,
      total_matches: toNullableNumber(metadata.totalMatches) ?? 0,
      pages_processed: toNullableNumber(metadata.pagesProcessed) ?? 0,
      start_time: toNullableString(metadata.startTime),
      end_time: toNullableString(metadata.endTime),
      trigger: toNullableString(metadata.trigger),
      error_message: item.errorMessage,
      metadata: item.metadata,
      created_at: item.createdAt,
    };
  }

  private mapAttendanceSyncJob(item: HikvisionAttendanceSyncJob) {
    const metadata = toObject(item.metadata);

    return {
      id: item.id,
      company_id: item.companyId,
      device_id: item.deviceId,
      queue_job_id: item.queueJobId,
      status: item.status.toLowerCase(),
      result_status: item.resultStatus ? item.resultStatus.toLowerCase() : null,
      sync_start_time: item.syncStartTime,
      sync_end_time: item.syncEndTime,
      started_at: item.startedAt,
      completed_at: item.completedAt,
      total_records_pulled: item.totalRecordsPulled,
      total_records_saved: item.totalRecordsSaved,
      valid_punch_records:
        toNullableNumber(metadata.validPunchRecords) ?? 0,
      skipped_system_events:
        toNullableNumber(metadata.skippedSystemEvents) ?? 0,
      error_message: item.errorMessage,
      max_results: toNullableNumber(metadata.maxResults),
      metadata: item.metadata,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
  }

  private ensureIsoRange(startTime: string, endTime: string) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException(
        'startTime/endTime must be valid ISO date-time values',
      );
    }

    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('endTime must be greater than startTime');
    }
  }

  private buildDayRange(
    date: string,
    timezone: string,
  ): { startTime: string; endTime: string } {
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
    const zonePart =
      parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT+00:00';
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
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(
        new Date(),
      );
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
    const parsed = toNullableDate(value);
    if (!parsed) {
      throw new BadRequestException(`Invalid or missing ${fieldName} value`);
    }
    return parsed;
  }

  private parseOptionalDateOrFail(
    value: unknown,
    fieldName: string,
  ): Date | null {
    if (value === null || value === undefined || String(value).trim() === '') {
      return null;
    }

    return this.parseDateOrFail(value, fieldName);
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
      throw new BadRequestException(
        `${fieldName} must be a non-negative integer`,
      );
    }
    return num;
  }

  private toObjectArray(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
      return value.map((item) => toObject(item));
    }

    if (value && typeof value === 'object') {
      return [toObject(value)];
    }

    return [];
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
          const num = toNullableNumber(value);
          if (num !== null) {
            return num;
          }
        }
      }
      queue.push(...Object.values(record));
    }

    return null;
  }

  private buildAttendanceSyncJobKey(
    companyId: number,
    deviceId: number,
  ): string {
    return `attendance-sync:${companyId}:${deviceId}`;
  }

  private buildAttendanceSyncQueueJobId(
    companyId: number,
    deviceId: number,
    syncJobId: number,
  ): string {
    return `attendance-sync-${companyId}-${deviceId}-${syncJobId}`;
  }

  private async findActiveAttendanceSyncJob(
    companyId: number,
    deviceId: number,
  ) {
    return this.attendanceSyncJobRepository.findOne({
      where: {
        companyId,
        deviceId,
        activeJobKey: this.buildAttendanceSyncJobKey(companyId, deviceId),
      },
      order: { createdAt: 'DESC' },
    });
  }

  private async failAttendanceSyncJob(syncJobId: number, errorMessage: string) {
    await this.attendanceSyncJobRepository.save({
      id: syncJobId,
      activeJobKey: null,
      status: HikvisionAttendanceSyncJobStatusEnum.FAILED,
      completedAt: new Date(),
      errorMessage,
    });
  }
}
