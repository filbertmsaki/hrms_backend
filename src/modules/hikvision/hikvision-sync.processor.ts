import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { HikvisionAttendanceSyncService } from './hikvision-attendance-sync.service';
import { HikvisionPeopleCredentialSyncService } from './hikvision-people-credential-sync.service';
import {
  HIKVISION_SYNC_QUEUE,
  HikvisionSyncJobData,
  HikvisionSyncJobName,
} from './hikvision-sync-job.constants';

@Processor(HIKVISION_SYNC_QUEUE, { lockDuration: 300000 })
export class HikvisionSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(HikvisionSyncProcessor.name);

  constructor(
    private readonly attendanceSyncService: HikvisionAttendanceSyncService,
    private readonly peopleCredentialSyncService: HikvisionPeopleCredentialSyncService,
  ) {
    super();
  }

  async process(job: Job<HikvisionSyncJobData>) {
    await job.updateProgress(5);

    switch (job.name as HikvisionSyncJobName) {
      case HikvisionSyncJobName.SYNC_ATTENDANCE: {
        const result = await this.attendanceSyncService.runQueuedAttendanceSync(
          job.data,
        );
        await job.updateProgress(100);
        return result;
      }

      case HikvisionSyncJobName.SYNC_USERS: {
        const result = await this.peopleCredentialSyncService.syncUsers(
          job.data.companyId,
          job.data.deviceId,
        );
        await job.updateProgress(100);
        return result;
      }

      case HikvisionSyncJobName.SYNC_FINGERPRINTS: {
        const result =
          await this.peopleCredentialSyncService.syncAllFingerprintsForSyncedUsers(
            job.data.companyId,
            job.data.deviceId,
          );
        await job.updateProgress(100);
        return result;
      }

      default:
        throw new Error(`Unsupported Hikvision sync job: ${job.name}`);
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<HikvisionSyncJobData>) {
    this.logger.log(
      `Completed Hikvision sync job ${job.id} (${job.name}) for device ${job.data.deviceId}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<HikvisionSyncJobData> | undefined, error: Error) {
    if (!job) {
      this.logger.error(
        `Hikvision sync job failed before start: ${error.message}`,
      );
      return;
    }

    this.logger.error(
      `Failed Hikvision sync job ${job.id} (${job.name}) for device ${job.data.deviceId}: ${error.message}`,
    );
  }
}
