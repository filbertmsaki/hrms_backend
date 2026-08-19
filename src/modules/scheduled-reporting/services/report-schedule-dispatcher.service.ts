import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../common/database/postgres-advisory-lock.service';
import { ReportExecution } from '../entities/report-execution.entity';
import { ReportSchedule } from '../entities/report-schedule.entity';
import { ReportTemplate } from '../entities/report-template.entity';
import { ReportEmailDeliveryStatusEnum } from '../enums/report-email-delivery-status.enum';
import { ReportExecutionSourceEnum } from '../enums/report-execution-source.enum';
import { ReportExecutionStatusEnum } from '../enums/report-execution-status.enum';
import { computeNextScheduleRunAt } from '../utils/report-schedule-next-run.util';

export const REPORT_SCHEDULE_DISPATCH_LOCK_KEY =
  'scheduled-reporting:schedule-dispatch';

@Injectable()
export class ReportScheduleDispatcherService {
  private readonly logger = new Logger(ReportScheduleDispatcherService.name);

  constructor(
    @InjectRepository(ReportSchedule)
    private readonly scheduleRepository: Repository<ReportSchedule>,
    @InjectRepository(ReportTemplate)
    private readonly templateRepository: Repository<ReportTemplate>,
    @InjectRepository(ReportExecution)
    private readonly executionRepository: Repository<ReportExecution>,
    private readonly advisoryLockService: PostgresAdvisoryLockService,
  ) {}

  @Interval(60000)
  async dispatch(): Promise<void> {
    await this.advisoryLockService.runWithLock(
      REPORT_SCHEDULE_DISPATCH_LOCK_KEY,
      async () => this.processDueSchedules(),
    );
  }

  private async processDueSchedules(): Promise<void> {
    const now = new Date();
    const schedules = await this.scheduleRepository.find({
      where: {
        isActive: true,
        nextRunAt: LessThanOrEqual(now),
      },
      relations: ['weekdays'],
      order: { nextRunAt: 'ASC' },
      take: 20,
    });

    for (const schedule of schedules) {
      try {
        await this.runSchedule(schedule, now);
      } catch (error) {
        this.logger.warn(
          `Failed to dispatch report schedule ${schedule.id}: ${(error as Error).message}`,
        );
      }
    }
  }

  private async runSchedule(
    schedule: ReportSchedule,
    now: Date,
  ): Promise<void> {
    const template = await this.templateRepository.findOne({
      where: { id: schedule.templateId, companyId: schedule.companyId },
    });

    if (!template || !template.isActive) {
      schedule.nextRunAt = this.computeNextRunAt(schedule, now);
      await this.scheduleRepository.save(schedule);
      return;
    }

    const reportDate = now.toISOString().slice(0, 10);
    const idempotencyKey = `schedule-${schedule.id}-${reportDate}`;

    const existing = await this.executionRepository.findOne({
      where: { idempotencyKey },
    });

    if (!existing) {
      await this.executionRepository.save(
        this.executionRepository.create({
          companyId: schedule.companyId,
          templateId: template.id,
          scheduleId: schedule.id,
          reportDefinitionId: template.reportDefinitionId,
          smtpConfigurationId: template.smtpConfigurationId,
          source: ReportExecutionSourceEnum.SCHEDULER,
          status: ReportExecutionStatusEnum.PENDING,
          emailDeliveryStatus: ReportEmailDeliveryStatusEnum.PENDING,
          idempotencyKey,
          reportDateFrom: reportDate,
          reportDateTo: reportDate,
          appliedFilters: {
            ...(template.reportFilters ?? {}),
            date_from: reportDate,
            date_to: reportDate,
          },
          executionMetadata: {
            requestedOutputFormat: template.outputFormat,
          },
          maxRetryAttempts: schedule.maxRetryAttempts,
        }),
      );
    }

    schedule.lastRunAt = now;
    schedule.nextRunAt = this.computeNextRunAt(schedule, now);
    await this.scheduleRepository.save(schedule);
  }

  private computeNextRunAt(schedule: ReportSchedule, from: Date): Date | null {
    return computeNextScheduleRunAt(
      {
        scheduleType: schedule.scheduleType,
        executionTime: schedule.executionTime,
        timezone: schedule.timezone,
        dayOfMonth: schedule.dayOfMonth,
        weekdays: schedule.weekdays?.map((weekday) => weekday.weekday) ?? [],
      },
      from,
    );
  }
}
