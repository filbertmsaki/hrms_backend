import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { AttendanceRecalculationJob } from './entities/attendance-recalculation-job.entity';
import { AttendanceProcessingJobStatusEnum } from './enums/attendance-processing-job-status.enum';
import { RecalculateAttendanceDto } from './dtos/recalculate-attendance.dto';
import { QueryAttendanceProcessingJobsDto } from './dtos/query-attendance-processing-jobs.dto';
import { AttendanceProcessingService } from './attendance-processing.service';

@Injectable()
export class AttendanceRecalculationService {
  private readonly logger = new Logger(AttendanceRecalculationService.name);

  constructor(
    @InjectRepository(AttendanceRecalculationJob)
    private readonly jobRepository: Repository<AttendanceRecalculationJob>,
    private readonly attendanceProcessingService: AttendanceProcessingService,
  ) {}

  async queueRecalculation(
    companyId: number,
    requestedByCompanyUserId: number | null,
    dto: RecalculateAttendanceDto,
  ) {
    const startDate = this.normalizeDate(dto.start_date, 'start_date');
    const endDate = this.normalizeDate(dto.end_date, 'end_date');
    if (endDate < startDate) {
      throw new BadRequestException('end_date cannot be before start_date');
    }

    const job = await this.jobRepository.save(
      this.jobRepository.create({
        companyId,
        employeeId: dto.employee_id ?? null,
        dateFrom: startDate,
        dateTo: endDate,
        reason: dto.reason?.trim() || null,
        status: AttendanceProcessingJobStatusEnum.PENDING,
        attempts: 0,
        requestedByCompanyUserId,
      }),
    );

    let executionResult: unknown = null;
    if (dto.process_immediately ?? true) {
      executionResult = await this.executeJob(job.id);
    }

    return {
      job,
      executionResult,
    };
  }

  async executeJob(jobId: number) {
    const job = await this.jobRepository.findOne({ where: { id: jobId } });
    if (!job) throw new BadRequestException('Recalculation job not found');

    if (job.status === AttendanceProcessingJobStatusEnum.PROCESSING) {
      throw new BadRequestException('Recalculation job is already processing');
    }

    job.status = AttendanceProcessingJobStatusEnum.PROCESSING;
    job.attempts += 1;
    job.lastError = null;
    await this.jobRepository.save(job);

    try {
      const result = await this.attendanceProcessingService.processRange(job.companyId, {
        start_date: job.dateFrom,
        end_date: job.dateTo,
        employee_id: job.employeeId ?? undefined,
        rebuild_summaries: true,
        force_rebuild_summaries: true,
      });

      job.status = AttendanceProcessingJobStatusEnum.SUCCESS;
      job.processedAt = new Date();
      job.metadata = { result };
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
      this.logger.warn(`Recalculation job ${job.id} failed: ${(error as Error).message}`);

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
    if (employee_id) qb.andWhere('job.employee_id = :employeeId', { employeeId: employee_id });
    if (from_date) qb.andWhere('job.date_from >= :fromDate', { fromDate: from_date });
    if (to_date) qb.andWhere('job.date_to <= :toDate', { toDate: to_date });

    const sortableColumns = new Set(['created_at', 'updated_at', 'processed_at']);
    const safeSortBy = sortableColumns.has(sortBy) ? sortBy : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [rows, total] = await qb
      .orderBy(`job.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows,
      meta: buildPaginationMeta(total, rows.length, limit, page),
    };
  }

  private normalizeDate(value: string, field: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return parsed.toISOString().slice(0, 10);
  }
}
