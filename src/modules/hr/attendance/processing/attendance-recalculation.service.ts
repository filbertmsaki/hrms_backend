import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../../../access-control/attendance-devices/enums/attendance-device-status.enum';
import { AttendanceDeviceSyncModeEnum } from '../../../access-control/attendance-devices/enums/attendance-device-sync-mode.enum';
import { EmployeeDeviceAssignment } from '../../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { AttendanceRecalculationJob } from './entities/attendance-recalculation-job.entity';
import { AttendanceProcessingJobStatusEnum } from './enums/attendance-processing-job-status.enum';
import { QueryAttendanceProcessingJobsDto } from './dtos/query-attendance-processing-jobs.dto';
import {
  AttendanceRefreshExecutionModeEnum,
  AttendanceRefreshExecutionEnum,
  AttendanceRefreshProcessingSourceEnum,
  AttendanceRefreshModeEnum,
  RefreshAttendanceDailySummariesDto,
} from './dtos/refresh-attendance-daily-summaries.dto';
import { AttendanceProcessingService } from './attendance-processing.service';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import { normalizeDateInput } from '../../shared/hr.utils';
import { HikvisionAttendanceSyncService } from '../../../hikvision/hikvision-attendance-sync.service';

enum AttendanceRefreshRunModeEnum {
  SUMMARIES_ONLY = 'summaries_only',
  DATABASE_ONLY = 'database_only',
  FETCH_AND_PROCESS = 'fetch_and_process',
}

type NormalizedAttendanceRefreshRequest = {
  startDate: string;
  endDate: string;
  employeeId?: number;
  deviceId?: number;
  executionMode: AttendanceRefreshExecutionModeEnum;
  runMode: AttendanceRefreshRunModeEnum;
};

type AttendanceFetchTarget = {
  device: AttendanceDevice;
  employeeNos: string[] | null;
};

@Injectable()
export class AttendanceRecalculationService {
  private readonly logger = new Logger(AttendanceRecalculationService.name);

  constructor(
    @InjectRepository(AttendanceRecalculationJob)
    private readonly jobRepository: Repository<AttendanceRecalculationJob>,
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly employeeDeviceAssignmentRepository: Repository<EmployeeDeviceAssignment>,
    private readonly moduleRef: ModuleRef,
    private readonly attendanceProcessingService: AttendanceProcessingService,
    private readonly attendanceDailySummaryService: AttendanceDailySummaryService,
  ) {}

  async refreshSummaries(
    companyId: number,
    requestedByCompanyUserId: number | null,
    dto: RefreshAttendanceDailySummariesDto,
  ) {
    const request = this.normalizeRefreshRequest(dto);

    if (
      request.executionMode === AttendanceRefreshExecutionModeEnum.BACKGROUND
    ) {
      let job = await this.createJob({
        companyId,
        employeeId: request.employeeId ?? null,
        dateFrom: request.startDate,
        dateTo: request.endDate,
        requestedByCompanyUserId,
        metadata: {
          refresh_mode: request.runMode,
          device_id: request.deviceId ?? null,
          processing_source:
            request.runMode === AttendanceRefreshRunModeEnum.FETCH_AND_PROCESS
              ? AttendanceRefreshProcessingSourceEnum.FETCH_AND_PROCESS
              : request.runMode === AttendanceRefreshRunModeEnum.DATABASE_ONLY
                ? AttendanceRefreshProcessingSourceEnum.DATABASE_ONLY
                : null,
          legacy_mode: dto.mode ?? null,
        },
      });

      void this.executeQueuedJobInBackground(job.id);

      const refreshedJob = await this.jobRepository.findOne({
        where: { id: job.id },
      });
      if (refreshedJob) {
        job = refreshedJob;
      }

      return {
        job,
        executionResult: null,
      };
    }

    return {
      job: null,
      executionResult: await this.executeRefreshMode({
        companyId,
        startDate: request.startDate,
        endDate: request.endDate,
        employeeId: request.employeeId,
        deviceId: request.deviceId,
        mode: request.runMode,
        requestedByCompanyUserId,
      }),
    };
  }

  async executeJob(jobId: number) {
    const claimResult = await this.jobRepository
      .createQueryBuilder()
      .update(AttendanceRecalculationJob)
      .set({
        status: AttendanceProcessingJobStatusEnum.PROCESSING,
        lastError: null,
        attempts: () => 'attempts + 1',
      })
      .where('id = :jobId', { jobId })
      .andWhere('status IN (:...statuses)', {
        statuses: [
          AttendanceProcessingJobStatusEnum.PENDING,
          AttendanceProcessingJobStatusEnum.FAILED,
        ],
      })
      .execute();

    if (!claimResult.affected) {
      const existingJob = await this.jobRepository.findOne({
        where: { id: jobId },
      });
      if (!existingJob) {
        throw new BadRequestException('Recalculation job not found');
      }
      if (existingJob.status === AttendanceProcessingJobStatusEnum.PROCESSING) {
        throw new BadRequestException(
          'Recalculation job is already processing',
        );
      }
      throw new BadRequestException(
        `Recalculation job cannot be executed from status ${existingJob.status}`,
      );
    }

    const job = await this.jobRepository.findOne({ where: { id: jobId } });
    if (!job) throw new BadRequestException('Recalculation job not found');

    try {
      const mode = this.resolveRefreshMode(job);
      const result = await this.executeRefreshMode({
        companyId: job.companyId,
        startDate: job.dateFrom,
        endDate: job.dateTo,
        employeeId: job.employeeId ?? undefined,
        deviceId: this.resolveMetadataDeviceId(job),
        mode,
        requestedByCompanyUserId: job.requestedByCompanyUserId ?? null,
      });

      job.status = AttendanceProcessingJobStatusEnum.SUCCESS;
      job.processedAt = new Date();
      job.metadata = {
        ...(job.metadata ?? {}),
        refresh_mode: mode,
        result,
      };
      await this.jobRepository.save(job);

      return {
        jobId: job.id,
        status: job.status,
        result,
      };
    } catch (error) {
      job.status = AttendanceProcessingJobStatusEnum.FAILED;
      job.lastError = (error as Error).message;
      job.processedAt = new Date();
      await this.jobRepository.save(job);
      this.logger.warn(
        `Recalculation job ${job.id} failed: ${(error as Error).message}`,
      );

      return {
        jobId: job.id,
        status: job.status,
        error: job.lastError,
      };
    }
  }

  async processPendingJobs(limit = 20) {
    const jobs = await this.jobRepository.find({
      where: { status: AttendanceProcessingJobStatusEnum.PENDING },
      order: { createdAt: 'ASC' },
      take: limit,
    });

    const results = [] as unknown[];
    for (const job of jobs) {
      results.push(await this.executeJob(job.id));
    }

    return {
      requested: limit,
      processed: jobs.length,
      results,
    };
  }

  private async createJob(input: {
    companyId: number;
    employeeId: number | null;
    dateFrom: string;
    dateTo: string;
    requestedByCompanyUserId: number | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    return this.jobRepository.save(
      this.jobRepository.create({
        companyId: input.companyId,
        employeeId: input.employeeId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        reason: input.reason ?? null,
        status: AttendanceProcessingJobStatusEnum.PENDING,
        attempts: 0,
        requestedByCompanyUserId: input.requestedByCompanyUserId,
        metadata: input.metadata ?? null,
      }),
    );
  }

  private resolveRefreshMode(
    job: AttendanceRecalculationJob,
  ): AttendanceRefreshRunModeEnum {
    const metadata = job.metadata ?? {};
    const mode =
      metadata.refresh_mode ??
      metadata.processing_source ??
      metadata.mode ??
      AttendanceRefreshModeEnum.FROM_RAW_LOGS;

    if (mode === AttendanceRefreshRunModeEnum.FETCH_AND_PROCESS) {
      return AttendanceRefreshRunModeEnum.FETCH_AND_PROCESS;
    }
    if (mode === AttendanceRefreshModeEnum.SUMMARIES_ONLY) {
      return AttendanceRefreshRunModeEnum.SUMMARIES_ONLY;
    }

    return AttendanceRefreshRunModeEnum.DATABASE_ONLY;
  }

  private async executeRefreshMode(input: {
    companyId: number;
    startDate: string;
    endDate: string;
    mode: AttendanceRefreshRunModeEnum;
    employeeId?: number;
    deviceId?: number;
    requestedByCompanyUserId?: number | null;
  }) {
    if (input.mode === AttendanceRefreshRunModeEnum.SUMMARIES_ONLY) {
      return this.attendanceDailySummaryService.rebuildSummariesForRange({
        companyId: input.companyId,
        startDate: input.startDate,
        endDate: input.endDate,
        employeeId: input.employeeId,
        deviceId: input.deviceId,
        forceRebuild: true,
      });
    }

    if (input.mode === AttendanceRefreshRunModeEnum.FETCH_AND_PROCESS) {
      return this.fetchAttendanceAndProcess(input);
    }

    return this.attendanceProcessingService.processRange(input.companyId, {
      start_date: input.startDate,
      end_date: input.endDate,
      employee_id: input.employeeId,
      device_id: input.deviceId,
      rebuild_summaries: true,
      force_rebuild_summaries: true,
    });
  }

  private async fetchAttendanceAndProcess(input: {
    companyId: number;
    startDate: string;
    endDate: string;
    employeeId?: number;
    deviceId?: number;
    requestedByCompanyUserId?: number | null;
  }) {
    const fetchResult = await this.fetchAttendanceFromDevices(input);
    const processingResult =
      await this.attendanceProcessingService.processRange(input.companyId, {
        start_date: input.startDate,
        end_date: input.endDate,
        employee_id: input.employeeId,
        device_id: input.deviceId,
        rebuild_summaries: true,
        force_rebuild_summaries: true,
      });

    return {
      companyId: input.companyId,
      startDate: input.startDate,
      endDate: input.endDate,
      employeeId: input.employeeId ?? null,
      deviceId: input.deviceId ?? null,
      processingSource: AttendanceRefreshProcessingSourceEnum.FETCH_AND_PROCESS,
      fetch: fetchResult,
      process: processingResult,
      status: this.combineRefreshStatuses(
        fetchResult.status,
        processingResult.status,
      ),
    };
  }

  private async executeQueuedJobInBackground(jobId: number): Promise<void> {
    try {
      await this.executeJob(jobId);
    } catch (error) {
      this.logger.warn(
        `Queued recalculation job ${jobId} failed during immediate background start: ${(error as Error).message}`,
      );
    }
  }

  async findJobs(companyId: number, query: QueryAttendanceProcessingJobsDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      status,
      employee_id,
      from_date,
      to_date,
    } = query;

    const qb = this.jobRepository
      .createQueryBuilder('job')
      .where('job.company_id = :companyId', { companyId });

    if (status) qb.andWhere('job.status = :status', { status });
    if (employee_id)
      qb.andWhere('job.employee_id = :employeeId', { employeeId: employee_id });
    if (from_date)
      qb.andWhere('job.date_from >= :fromDate', { fromDate: from_date });
    if (to_date) qb.andWhere('job.date_to <= :toDate', { toDate: to_date });

    const sortableColumns = new Set([
      'created_at',
      'updated_at',
      'processed_at',
    ]);
    const columnPropertyMap: Record<string, string> = {
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      processed_at: 'processedAt',
    };
    const safeSortBy = sortableColumns.has(sortBy) ? sortBy : 'created_at';
    const safeSortProperty = columnPropertyMap[safeSortBy] ?? safeSortBy;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [rows, total] = await qb
      .orderBy(`job.${safeSortProperty}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows,
      meta: buildPaginationMeta(total, rows.length, limit, page),
    };
  }

  private normalizeDate(value: string, field: string): string {
    try {
      return normalizeDateInput(value, field);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  private normalizeRefreshRequest(
    dto: RefreshAttendanceDailySummariesDto,
  ): NormalizedAttendanceRefreshRequest {
    const startDate = this.normalizeDate(dto.start_date, 'start_date');
    const endDate = this.normalizeDate(dto.end_date, 'end_date');
    if (endDate < startDate) {
      throw new BadRequestException('end_date cannot be before start_date');
    }

    const executionMode =
      dto.execution_mode ??
      (dto.execution === AttendanceRefreshExecutionEnum.SYNC
        ? AttendanceRefreshExecutionModeEnum.IMMEDIATE
        : dto.execution === AttendanceRefreshExecutionEnum.ASYNC
          ? AttendanceRefreshExecutionModeEnum.BACKGROUND
          : AttendanceRefreshExecutionModeEnum.BACKGROUND);
    const legacyMode = dto.mode;
    const processingSource =
      dto.processing_source ??
      AttendanceRefreshProcessingSourceEnum.DATABASE_ONLY;

    let runMode = AttendanceRefreshRunModeEnum.DATABASE_ONLY;
    if (legacyMode === AttendanceRefreshModeEnum.SUMMARIES_ONLY) {
      runMode = AttendanceRefreshRunModeEnum.SUMMARIES_ONLY;
    } else if (
      processingSource ===
      AttendanceRefreshProcessingSourceEnum.FETCH_AND_PROCESS
    ) {
      runMode = AttendanceRefreshRunModeEnum.FETCH_AND_PROCESS;
    }

    return {
      startDate,
      endDate,
      employeeId: dto.employee_id,
      deviceId: dto.device_id,
      executionMode,
      runMode,
    };
  }

  private resolveMetadataDeviceId(
    job: AttendanceRecalculationJob,
  ): number | undefined {
    const metadata = job.metadata ?? {};
    const value = metadata.device_id ?? metadata.deviceId;
    const deviceId = Number(value);
    return Number.isInteger(deviceId) && deviceId > 0 ? deviceId : undefined;
  }

  private async fetchAttendanceFromDevices(input: {
    companyId: number;
    startDate: string;
    endDate: string;
    employeeId?: number;
    deviceId?: number;
    requestedByCompanyUserId?: number | null;
  }) {
    const syncService = this.getHikvisionAttendanceSyncService();
    const targets = await this.resolveFetchTargets(
      input.companyId,
      input.employeeId,
      input.deviceId,
    );

    const skippedMessages: string[] = [];
    if (!targets.length && input.employeeId && input.deviceId) {
      skippedMessages.push(
        `Employee ${input.employeeId} has no active Hikvision device assignment for device ${input.deviceId}.`,
      );
    } else if (!targets.length && input.employeeId) {
      skippedMessages.push(
        `Employee ${input.employeeId} has no active Hikvision device assignments to fetch from.`,
      );
    } else if (!targets.length) {
      skippedMessages.push(
        'No active Hikvision devices were available to fetch from.',
      );
    }

    const devices: Array<Record<string, unknown>> = [];
    const totals = {
      recordsReceived: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      duplicatesSkipped: 0,
      unmappedEmployees: 0,
      recordsFailed: 0,
      validPunchRecords: 0,
    };
    let devicesSucceeded = 0;
    let devicesFailed = 0;
    let devicesSkipped = 0;

    for (const target of targets) {
      const employeeNos = target.employeeNos?.length
        ? target.employeeNos
        : [null];
      const deviceTotals = {
        recordsReceived: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        duplicatesSkipped: 0,
        unmappedEmployees: 0,
        recordsFailed: 0,
        validPunchRecords: 0,
      };
      const syncResults: Array<Record<string, unknown>> = [];
      let deviceFailed = false;
      let failureMessage: string | null = null;

      for (const employeeNo of employeeNos) {
        try {
          const result =
            await syncService.syncAttendanceByDateRangeForDeviceTimezone(
              input.companyId,
              target.device.id,
              input.startDate,
              input.endDate,
              employeeNo ?? undefined,
              undefined,
              input.requestedByCompanyUserId ?? null,
              {
                queueAttendanceRecalculation: false,
              },
            );

          deviceTotals.recordsReceived += result.recordsReceived;
          deviceTotals.recordsCreated += result.recordsCreated;
          deviceTotals.recordsUpdated += result.recordsUpdated;
          deviceTotals.duplicatesSkipped += result.duplicatesSkipped;
          deviceTotals.unmappedEmployees += result.unmappedEmployees;
          deviceTotals.recordsFailed += result.recordsFailed;
          deviceTotals.validPunchRecords += result.validPunchRecords;
          syncResults.push({
            employee_no: employeeNo,
            status: result.status,
            records_received: result.recordsReceived,
            records_created: result.recordsCreated,
            records_updated: result.recordsUpdated,
            duplicates_skipped: result.duplicatesSkipped,
            unmapped_employees: result.unmappedEmployees,
            records_failed: result.recordsFailed,
          });
        } catch (error) {
          deviceFailed = true;
          failureMessage = (error as Error).message;
          this.logger.warn(
            `Attendance fetch skipped failed device ${target.device.id}: ${(error as Error).message}`,
          );
          syncResults.push({
            employee_no: employeeNo,
            status: 'FAILED',
            error_message: failureMessage,
          });
        }
      }

      totals.recordsReceived += deviceTotals.recordsReceived;
      totals.recordsCreated += deviceTotals.recordsCreated;
      totals.recordsUpdated += deviceTotals.recordsUpdated;
      totals.duplicatesSkipped += deviceTotals.duplicatesSkipped;
      totals.unmappedEmployees += deviceTotals.unmappedEmployees;
      totals.recordsFailed += deviceTotals.recordsFailed;
      totals.validPunchRecords += deviceTotals.validPunchRecords;

      if (
        deviceFailed &&
        deviceTotals.recordsCreated + deviceTotals.recordsUpdated === 0
      ) {
        devicesFailed += 1;
      } else if (deviceFailed) {
        devicesFailed += 1;
      } else if ((target.employeeNos?.length ?? 0) === 0 && input.employeeId) {
        devicesSkipped += 1;
      } else {
        devicesSucceeded += 1;
      }

      devices.push({
        device_id: target.device.id,
        device_code: target.device.deviceCode,
        employee_nos: target.employeeNos,
        status: deviceFailed
          ? deviceTotals.recordsCreated + deviceTotals.recordsUpdated > 0
            ? 'PARTIAL'
            : 'FAILED'
          : 'SUCCESS',
        message: failureMessage,
        ...this.toSnakeSyncTotals(deviceTotals),
        sync_results: syncResults,
      });
    }

    if (!targets.length) {
      devicesSkipped = skippedMessages.length > 0 ? 1 : 0;
    }

    return {
      requested_device_count: targets.length,
      attempted_device_count: devices.length,
      devices_succeeded: devicesSucceeded,
      devices_failed: devicesFailed,
      devices_skipped: devicesSkipped,
      devices,
      skipped_messages: skippedMessages,
      ...this.toSnakeSyncTotals(totals),
      status: this.resolveFetchStatus(
        targets.length,
        devicesSucceeded,
        devicesFailed,
        devicesSkipped,
      ),
    };
  }

  private combineRefreshStatuses(
    fetchStatus: string,
    processStatus: string,
  ): 'SUCCESS' | 'PARTIAL' | 'FAILED' {
    if (processStatus === 'FAILED') {
      return 'FAILED';
    }
    if (
      processStatus === 'PARTIAL' ||
      fetchStatus === 'FAILED' ||
      fetchStatus === 'PARTIAL'
    ) {
      return 'PARTIAL';
    }
    return 'SUCCESS';
  }

  private resolveFetchStatus(
    targetCount: number,
    succeeded: number,
    failed: number,
    skipped: number,
  ): 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED' {
    if (targetCount === 0 || (succeeded === 0 && failed === 0 && skipped > 0)) {
      return 'SKIPPED';
    }
    if (failed === 0) {
      return 'SUCCESS';
    }
    if (succeeded > 0) {
      return 'PARTIAL';
    }
    return 'FAILED';
  }

  private toSnakeSyncTotals(input: {
    recordsReceived: number;
    recordsCreated: number;
    recordsUpdated: number;
    duplicatesSkipped: number;
    unmappedEmployees: number;
    recordsFailed: number;
    validPunchRecords: number;
  }) {
    return {
      records_received: input.recordsReceived,
      records_created: input.recordsCreated,
      records_updated: input.recordsUpdated,
      duplicates_skipped: input.duplicatesSkipped,
      unmapped_employees: input.unmappedEmployees,
      records_failed: input.recordsFailed,
      valid_punch_records: input.validPunchRecords,
    };
  }

  private async resolveFetchTargets(
    companyId: number,
    employeeId?: number,
    deviceId?: number,
  ): Promise<AttendanceFetchTarget[]> {
    if (!employeeId) {
      const devices = deviceId
        ? [await this.findEligibleDeviceOrFail(companyId, deviceId)]
        : await this.findEligibleDevices(companyId);
      return devices.map((device) => ({
        device,
        employeeNos: null,
      }));
    }

    const assignments = await this.employeeDeviceAssignmentRepository.find({
      where: {
        companyId,
        employeeId,
        ...(deviceId ? { deviceId } : {}),
      },
      relations: {
        device: true,
      },
    });

    const groupedTargets = new Map<number, AttendanceFetchTarget>();
    for (const assignment of assignments) {
      if (!assignment.deviceId || !assignment.device) {
        continue;
      }
      if (!this.isEligibleHikvisionDevice(assignment.device)) {
        continue;
      }
      const employeeNo = assignment.employeeNo.trim();
      if (!employeeNo) {
        continue;
      }

      const current = groupedTargets.get(assignment.deviceId) ?? {
        device: assignment.device,
        employeeNos: [],
      };
      if (!current.employeeNos!.includes(employeeNo)) {
        current.employeeNos!.push(employeeNo);
      }
      groupedTargets.set(assignment.deviceId, current);
    }

    if (deviceId && groupedTargets.size === 0) {
      await this.findEligibleDeviceOrFail(companyId, deviceId);
    }

    return [...groupedTargets.values()];
  }

  private async findEligibleDevices(companyId: number) {
    return this.attendanceDeviceRepository
      .createQueryBuilder('device')
      .where('device.company_id = :companyId', { companyId })
      .andWhere('device.status = :status', {
        status: AttendanceDeviceStatusEnum.ACTIVE,
      })
      .andWhere('device.sync_mode = :syncMode', {
        syncMode: AttendanceDeviceSyncModeEnum.PULL,
      })
      .andWhere(
        "(LOWER(device.integration_type) = :integrationType OR LOWER(COALESCE(device.vendor_name, '')) LIKE :vendor)",
        {
          integrationType: 'hikvision',
          vendor: '%hikvision%',
        },
      )
      .orderBy('device.id', 'ASC')
      .getMany();
  }

  private async findEligibleDeviceOrFail(companyId: number, deviceId: number) {
    const device = await this.attendanceDeviceRepository.findOne({
      where: { id: deviceId, companyId },
    });
    if (!device) {
      throw new BadRequestException('Hikvision device not found');
    }
    if (!this.isEligibleHikvisionDevice(device)) {
      throw new BadRequestException(
        'Requested device is not an active pull-mode Hikvision attendance device',
      );
    }
    return device;
  }

  private isEligibleHikvisionDevice(
    device: AttendanceDevice | null | undefined,
  ) {
    if (!device) {
      return false;
    }

    const integrationType = device.integrationType?.trim().toLowerCase() ?? '';
    const vendorName = device.vendorName?.trim().toLowerCase() ?? '';

    return (
      device.status === AttendanceDeviceStatusEnum.ACTIVE &&
      device.syncMode === AttendanceDeviceSyncModeEnum.PULL &&
      (integrationType === 'hikvision' || vendorName.includes('hikvision'))
    );
  }

  private getHikvisionAttendanceSyncService() {
    return this.moduleRef.get(HikvisionAttendanceSyncService, {
      strict: false,
    });
  }
}
