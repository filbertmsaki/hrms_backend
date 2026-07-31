import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { AttendanceRecalculationJob } from './entities/attendance-recalculation-job.entity';
import { AttendanceProcessingJobStatusEnum } from './enums/attendance-processing-job-status.enum';
import { QueryAttendanceProcessingJobsDto } from './dtos/query-attendance-processing-jobs.dto';
import {
  AttendanceRefreshExecutionEnum,
  AttendanceRefreshModeEnum,
  RefreshAttendanceDailySummariesDto,
} from './dtos/refresh-attendance-daily-summaries.dto';
import { AttendanceProcessingService } from './attendance-processing.service';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import { normalizeDateInput } from '../../shared/hr.utils';

@Injectable()
export class AttendanceRecalculationService {
  private readonly logger = new Logger(AttendanceRecalculationService.name);

  constructor(
    @InjectRepository(AttendanceRecalculationJob)
    private readonly jobRepository: Repository<AttendanceRecalculationJob>,
    private readonly attendanceProcessingService: AttendanceProcessingService,
    private readonly attendanceDailySummaryService: AttendanceDailySummaryService,
  ) {}

  async refreshSummaries(
    companyId: number,
    requestedByCompanyUserId: number | null,
    dto: RefreshAttendanceDailySummariesDto,
  ) {
    const startDate = this.normalizeDate(dto.start_date, 'start_date');
    const endDate = this.normalizeDate(dto.end_date, 'end_date');
    if (endDate < startDate) {
      throw new BadRequestException('end_date cannot be before start_date');
    }

    if (dto.execution === AttendanceRefreshExecutionEnum.ASYNC) {
      let job = await this.createJob({
        companyId,
        employeeId: null,
        dateFrom: startDate,
        dateTo: endDate,
        requestedByCompanyUserId,
        metadata: {
          refresh_mode: dto.mode,
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
        startDate,
        endDate,
        mode: dto.mode,
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
        mode,
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
  ): AttendanceRefreshModeEnum {
    const metadata = job.metadata ?? {};
    const mode =
      metadata.refresh_mode ??
      metadata.mode ??
      AttendanceRefreshModeEnum.FROM_RAW_LOGS;

    if (mode === AttendanceRefreshModeEnum.SUMMARIES_ONLY) {
      return AttendanceRefreshModeEnum.SUMMARIES_ONLY;
    }

    return AttendanceRefreshModeEnum.FROM_RAW_LOGS;
  }

  private async executeRefreshMode(input: {
    companyId: number;
    startDate: string;
    endDate: string;
    mode: AttendanceRefreshModeEnum;
    employeeId?: number;
  }) {
    if (input.mode === AttendanceRefreshModeEnum.SUMMARIES_ONLY) {
      return this.attendanceDailySummaryService.rebuildSummariesForRange({
        companyId: input.companyId,
        startDate: input.startDate,
        endDate: input.endDate,
        employeeId: input.employeeId,
        forceRebuild: true,
      });
    }

    return this.attendanceProcessingService.processRange(input.companyId, {
      start_date: input.startDate,
      end_date: input.endDate,
      employee_id: input.employeeId,
      rebuild_summaries: true,
      force_rebuild_summaries: true,
    });
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
}
