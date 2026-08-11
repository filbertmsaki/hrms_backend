import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { EmployeeImportBatch } from './entities/employee-import-batch.entity';
import { EmployeeImportBatchStatusEnum } from './enums/employee-import-batch-status.enum';

@Injectable()
export class EmployeeImportCleanupService {
  constructor(
    @InjectRepository(EmployeeImportBatch)
    private readonly batchRepository: Repository<EmployeeImportBatch>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async expireStalePreviews(): Promise<void> {
    await this.batchRepository.update(
      {
        status: EmployeeImportBatchStatusEnum.PREVIEW_READY,
        previewExpiresAt: LessThan(new Date()),
      },
      {
        status: EmployeeImportBatchStatusEnum.EXPIRED,
      },
    );
  }
}
