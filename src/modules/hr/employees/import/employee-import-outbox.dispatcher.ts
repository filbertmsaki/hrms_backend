import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import {
  EMPLOYEE_IMPORT_QUEUE,
  EmployeeImportJobData,
  EmployeeImportJobName,
} from './employee-import-job.constants';
import { EmployeeImportOutboxEvent } from './entities/employee-import-outbox-event.entity';
import { EmployeeImportOutboxEventType } from './enums/employee-import-outbox-event-type.enum';
import { EmployeeImportOutboxStatus } from './enums/employee-import-outbox-status.enum';
import { HikvisionImportSyncService } from '../../../hikvision/hikvision-import-sync.service';

@Injectable()
export class EmployeeImportOutboxDispatcher {
  private readonly logger = new Logger(EmployeeImportOutboxDispatcher.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(EmployeeImportOutboxEvent)
    private readonly repository: Repository<EmployeeImportOutboxEvent>,
    @InjectQueue(EMPLOYEE_IMPORT_QUEUE)
    private readonly queue: Queue<EmployeeImportJobData>,
    private readonly hikvisionImportSyncService: HikvisionImportSyncService,
  ) {}

  @Interval(5000)
  async dispatch(): Promise<void> {
    const candidates = await this.repository.find({
      where: {
        status: EmployeeImportOutboxStatus.PENDING,
        availableAt: LessThanOrEqual(new Date()),
      },
      order: { id: 'ASC' },
      take: 20,
    });

    for (const candidate of candidates) {
      await this.publishOne(candidate.id);
    }
  }

  private async publishOne(id: number): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(EmployeeImportOutboxEvent);
        const event = await repository
          .createQueryBuilder('event')
          .setLock('pessimistic_write')
          .where('event.id = :id', { id })
          .getOne();

        if (!event || event.status !== EmployeeImportOutboxStatus.PENDING) {
          return;
        }

        if (
          event.eventType === EmployeeImportOutboxEventType.PROCESS_IMPORT_BATCH
        ) {
          const payload = event.payload as unknown as EmployeeImportJobData;
          await this.queue.add(EmployeeImportJobName.PROCESS_BATCH, payload, {
            jobId: `employee-import:${payload.companyId}:${payload.databaseBatchId}`,
            attempts: 1,
            removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
            removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 },
          });
        } else if (
          event.eventType ===
          EmployeeImportOutboxEventType.SCHEDULE_HIKVISION_SYNC
        ) {
          await this.hikvisionImportSyncService.scheduleImportedEmployeesSync(
            event.payload as Parameters<
              HikvisionImportSyncService['scheduleImportedEmployeesSync']
            >[0],
          );
        }

        event.status = EmployeeImportOutboxStatus.PUBLISHED;
        event.publishedAt = new Date();
        event.lastError = null;
        event.attemptCount += 1;
        await repository.save(event);
      });
    } catch (error) {
      this.logger.error(
        `Failed to publish employee import outbox event ${id}: ${(error as Error).message}`,
        error instanceof Error ? error.stack : undefined,
      );

      await this.repository
        .createQueryBuilder()
        .update(EmployeeImportOutboxEvent)
        .set({
          attemptCount: () => '"attempt_count" + 1',
          status: EmployeeImportOutboxStatus.FAILED,
          lastError:
            error instanceof Error ? error.message : 'Outbox publish failed',
        } as never)
        .where('id = :id', { id })
        .execute();
    }
  }
}
