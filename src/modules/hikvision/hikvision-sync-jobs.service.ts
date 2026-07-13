import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Queue } from 'bullmq';
import {
  HIKVISION_SYNC_QUEUE,
  HikvisionSyncJobData,
  HikvisionSyncJobName,
} from './hikvision-sync-job.constants';

@Injectable()
export class HikvisionSyncJobsService {
  constructor(
    @InjectQueue(HIKVISION_SYNC_QUEUE)
    private readonly syncQueue: Queue<HikvisionSyncJobData>,
  ) {}

  async enqueueUsersSync(
    companyId: number,
    deviceId: number,
    requestedByUserId: number | null,
    requestedByCompanyUserId: number | null,
  ) {
    const job = await this.syncQueue.add(
      HikvisionSyncJobName.SYNC_USERS,
      {
        companyId,
        deviceId,
        requestedByUserId,
        requestedByCompanyUserId,
        requestedAt: new Date().toISOString(),
      },
      {
        attempts: 1,
        removeOnComplete: {
          age: 24 * 60 * 60,
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60,
          count: 1000,
        },
      },
    );

    return this.mapQueuedJob(job);
  }

  async enqueueFingerprintsSync(
    companyId: number,
    deviceId: number,
    requestedByUserId: number | null,
    requestedByCompanyUserId: number | null,
  ) {
    const job = await this.syncQueue.add(
      HikvisionSyncJobName.SYNC_FINGERPRINTS,
      {
        companyId,
        deviceId,
        requestedByUserId,
        requestedByCompanyUserId,
        requestedAt: new Date().toISOString(),
      },
      {
        attempts: 1,
        removeOnComplete: {
          age: 24 * 60 * 60,
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60,
          count: 1000,
        },
      },
    );

    return this.mapQueuedJob(job);
  }

  async getJobStatus(companyId: number, jobId: string) {
    const job = await this.syncQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Sync job not found');
    }

    if (job.data.companyId !== companyId) {
      throw new ForbiddenException('You cannot access this sync job');
    }

    const state = await job.getState();

    return {
      id: job.id,
      name: job.name,
      state,
      progress:
        typeof job.progress === 'number' || job.progress === null
          ? job.progress
          : (job.progress ?? null),
      data: job.data,
      result: (job.returnvalue as unknown) ?? null,
      failed_reason: job.failedReason || null,
      created_at: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      processed_at: job.processedOn
        ? new Date(job.processedOn).toISOString()
        : null,
      finished_at: job.finishedOn
        ? new Date(job.finishedOn).toISOString()
        : null,
    };
  }

  private mapQueuedJob(job: Job<HikvisionSyncJobData>) {
    return {
      message: 'Sync job queued successfully',
      job_id: String(job.id),
      job_name: job.name,
      state: 'waiting',
      created_at: new Date(job.timestamp).toISOString(),
    };
  }
}
