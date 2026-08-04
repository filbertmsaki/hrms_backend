import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { OffboardingRequest } from '../entities/offboarding-request.entity';
import { OffboardingRequestStatusEnum } from '../enums/offboarding-request-status.enum';
import { OFFBOARDING_ACCESS_TERMINATION_DISPATCH_LOCK_KEY } from '../offboarding-access-termination.constants';
import { OffboardingAccessTerminationService } from './offboarding-access-termination.service';

@Injectable()
export class OffboardingAccessTerminationDispatcherService {
  private readonly logger = new Logger(
    OffboardingAccessTerminationDispatcherService.name,
  );
  private readonly workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

  constructor(
    @InjectRepository(OffboardingRequest)
    private readonly requestRepository: Repository<OffboardingRequest>,
    private readonly advisoryLockService: PostgresAdvisoryLockService,
    private readonly accessTerminationService: OffboardingAccessTerminationService,
  ) {}

  @Interval(30000)
  async dispatch(): Promise<void> {
    await this.advisoryLockService.runWithLock(
      OFFBOARDING_ACCESS_TERMINATION_DISPATCH_LOCK_KEY,
      async () => this.processDueRequests(),
    );
  }

  private async processDueRequests(): Promise<void> {
    const now = new Date();
    const requests = await this.requestRepository
      .createQueryBuilder('request')
      .where('request.status IN (:...statuses)', {
        statuses: [
          OffboardingRequestStatusEnum.TERMINATION_SCHEDULED,
          OffboardingRequestStatusEnum.READY_FOR_TERMINATION,
          OffboardingRequestStatusEnum.ACCESS_TERMINATION_FAILED,
        ],
      })
      .andWhere(
        '(request.access_termination_scheduled_at IS NULL OR request.access_termination_scheduled_at <= :now)',
        { now },
      )
      .orderBy('request.access_termination_scheduled_at', 'ASC')
      .take(20)
      .getMany();

    for (const request of requests) {
      try {
        await this.accessTerminationService.processTermination(
          { companyId: request.company_id, offboardingRequestId: request.id },
          this.workerId,
        );
      } catch (error) {
        this.logger.warn(
          `Access termination failed for offboarding request ${request.id}: ${(error as Error).message}`,
        );
      }
    }
  }
}
