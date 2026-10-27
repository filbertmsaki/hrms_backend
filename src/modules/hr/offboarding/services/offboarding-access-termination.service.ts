import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OffboardingAccessOperation } from '../entities/offboarding-access-operation.entity';
import { OffboardingRequest } from '../entities/offboarding-request.entity';
import { OffboardingAccessOperationStatusEnum } from '../enums/offboarding-access-operation-status.enum';
import { OffboardingRequestStatusEnum } from '../enums/offboarding-request-status.enum';
import { OffboardingAccessOperationExecutorService } from './offboarding-access-operation-executor.service';
import { OffboardingAccessTerminationJobData } from '../offboarding-access-termination.constants';
import { EmployeeFinanceExitRecoveryService } from '../../employee-finance/services/employee-finance-core.services';

@Injectable()
export class OffboardingAccessTerminationService {
  private readonly logger = new Logger(
    OffboardingAccessTerminationService.name,
  );

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(OffboardingRequest)
    private readonly requestRepository: Repository<OffboardingRequest>,
    @InjectRepository(OffboardingAccessOperation)
    private readonly operationRepository: Repository<OffboardingAccessOperation>,
    private readonly executor: OffboardingAccessOperationExecutorService,
    @Optional()
    private readonly financeExitRecoveryService?: EmployeeFinanceExitRecoveryService,
  ) {}

  async processTermination(
    job: OffboardingAccessTerminationJobData,
    workerId: string,
  ): Promise<{ status: string }> {
    const claimed = await this.dataSource.transaction(async (manager) => {
      const request = await manager
        .getRepository(OffboardingRequest)
        .createQueryBuilder('request')
        .setLock('pessimistic_write')
        .where('request.id = :id', { id: job.offboardingRequestId })
        .andWhere('request.company_id = :companyId', {
          companyId: job.companyId,
        })
        .getOne();

      if (!request) {
        throw new NotFoundException('Offboarding request not found');
      }

      if (request.access_terminated_at) {
        return request.status ===
          OffboardingRequestStatusEnum.READY_FOR_FINALIZATION
          ? request
          : null;
      }

      if (
        ![
          OffboardingRequestStatusEnum.TERMINATION_SCHEDULED,
          OffboardingRequestStatusEnum.READY_FOR_TERMINATION,
          OffboardingRequestStatusEnum.ACCESS_TERMINATION_FAILED,
        ].includes(request.status)
      ) {
        return null;
      }

      request.status = OffboardingRequestStatusEnum.TERMINATING_ACCESS;
      request.access_termination_started_at = new Date();
      request.access_termination_worker_id = workerId;
      request.access_termination_attempt_count += 1;
      request.access_termination_failed_at = null;
      request.access_termination_failure_reason = null;

      return manager.getRepository(OffboardingRequest).save(request);
    });

    if (!claimed) {
      return { status: 'skipped' };
    }

    if (claimed.access_terminated_at) {
      try {
        await this.financeExitRecoveryService?.createForOffboarding(
          job.companyId,
          job.offboardingRequestId,
        );
      } catch (error) {
        await this.requestRepository.update(
          { id: job.offboardingRequestId, company_id: job.companyId },
          { status: OffboardingRequestStatusEnum.READY_FOR_FINALIZATION },
        );
        throw error;
      }
      return { status: 'terminated' };
    }

    try {
      const request = await this.requestRepository.findOneOrFail({
        where: { id: job.offboardingRequestId, company_id: job.companyId },
        relations: { employee: { company_user: true } },
      });

      const operations = await this.operationRepository.find({
        where: { offboarding_request_id: request.id },
        order: { id: 'ASC' },
      });

      let hasFailure = false;

      for (const operation of operations) {
        if (
          operation.status === OffboardingAccessOperationStatusEnum.COMPLETED ||
          operation.status === OffboardingAccessOperationStatusEnum.SKIPPED
        ) {
          continue;
        }

        const outcome = await this.executeOperation(operation.id, request);
        if (outcome === OffboardingAccessOperationStatusEnum.FAILED) {
          hasFailure = true;
        }
      }

      if (hasFailure) {
        await this.requestRepository.update(
          { id: job.offboardingRequestId, company_id: job.companyId },
          {
            status: OffboardingRequestStatusEnum.ACCESS_TERMINATION_FAILED,
            access_termination_failed_at: new Date(),
            access_termination_failure_reason:
              'One or more access-termination operations failed. See offboarding_access_operations for details.',
          },
        );
        return { status: 'failed' };
      }

      await this.finalizeAccessTermination(job);
      await this.financeExitRecoveryService?.createForOffboarding(
        job.companyId,
        job.offboardingRequestId,
      );
      return { status: 'terminated' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Access termination failed';
      const current = await this.requestRepository.findOne({
        where: { id: job.offboardingRequestId, company_id: job.companyId },
      });

      await this.requestRepository.update(
        { id: job.offboardingRequestId, company_id: job.companyId },
        {
          status: current?.access_terminated_at
            ? OffboardingRequestStatusEnum.READY_FOR_FINALIZATION
            : OffboardingRequestStatusEnum.ACCESS_TERMINATION_FAILED,
          access_termination_failed_at: current?.access_terminated_at
            ? null
            : new Date(),
          access_termination_failure_reason: message,
        },
      );

      throw error;
    }
  }

  private async executeOperation(
    operationId: number,
    request: OffboardingRequest,
  ): Promise<OffboardingAccessOperationStatusEnum> {
    return this.dataSource.transaction(async (manager) => {
      const operationRepository = manager.getRepository(
        OffboardingAccessOperation,
      );
      const operation = await operationRepository
        .createQueryBuilder('operation')
        .setLock('pessimistic_write')
        .where('operation.id = :id', { id: operationId })
        .getOneOrFail();

      operation.status = OffboardingAccessOperationStatusEnum.PROCESSING;
      operation.started_at = new Date();
      operation.attempt_count += 1;
      await operationRepository.save(operation);

      try {
        const result = await this.executor.execute(
          operation.operation_type,
          request,
          manager,
        );

        operation.status = result.skipped
          ? OffboardingAccessOperationStatusEnum.SKIPPED
          : OffboardingAccessOperationStatusEnum.COMPLETED;
        operation.completed_at = new Date();
        operation.last_error = null;
        operation.metadata = {
          ...(operation.metadata ?? {}),
          result: result.detail,
        };
        await operationRepository.save(operation);
        return operation.status;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Operation failed';
        operation.status = OffboardingAccessOperationStatusEnum.FAILED;
        operation.failed_at = new Date();
        operation.last_error = message;
        await operationRepository.save(operation);
        this.logger.warn(
          `Access operation ${operation.operation_type} failed for offboarding request ${request.id}: ${message}`,
        );
        return operation.status;
      }
    });
  }

  private async finalizeAccessTermination(
    job: OffboardingAccessTerminationJobData,
  ): Promise<OffboardingRequest> {
    return this.dataSource.transaction(async (manager) => {
      const requestRepository = manager.getRepository(OffboardingRequest);
      const operationRepository = manager.getRepository(
        OffboardingAccessOperation,
      );

      const request = await requestRepository
        .createQueryBuilder('request')
        .setLock('pessimistic_write')
        .where('request.id = :id', { id: job.offboardingRequestId })
        .andWhere('request.company_id = :companyId', {
          companyId: job.companyId,
        })
        .getOneOrFail();

      const incompleteOperations = await operationRepository
        .createQueryBuilder('operation')
        .where('operation.offboarding_request_id = :requestId', {
          requestId: request.id,
        })
        .andWhere('operation.status NOT IN (:...statuses)', {
          statuses: [
            OffboardingAccessOperationStatusEnum.COMPLETED,
            OffboardingAccessOperationStatusEnum.SKIPPED,
          ],
        })
        .getCount();

      if (incompleteOperations > 0) {
        throw new Error(
          'One or more access-termination operations are incomplete.',
        );
      }

      request.status = OffboardingRequestStatusEnum.READY_FOR_FINALIZATION;
      request.access_terminated_at = new Date();
      request.access_termination_failure_reason = null;

      return requestRepository.save(request);
    });
  }
}
