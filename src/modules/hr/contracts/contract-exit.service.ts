import { Injectable, Optional } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull, Not } from 'typeorm';
import { SecurityEventsService } from '../../security/security-events.service';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { EmploymentHistoryService } from '../employment-history/employment-history.service';
import { EmploymentEventTypeEnum } from '../employment-history/enums/employment-event-type.enum';
import { assertTransition, ContractAction } from './contract-lifecycle';
import {
  EmploymentContract,
  EmploymentContractStatus,
} from './entities/employment-contract.entity';
import { ContractSigningChallenge } from './entities/contract-signing-challenge.entity';

/** Employment statuses that mean the person has left the company. */
export const EXITED_EMPLOYMENT_STATUSES: EmploymentStatusEnum[] = [
  EmploymentStatusEnum.RESIGNED,
  EmploymentStatusEnum.TERMINATED,
  EmploymentStatusEnum.RETIRED,
  EmploymentStatusEnum.DECEASED,
  EmploymentStatusEnum.EXITED,
];

const UNFINISHED = [
  EmploymentContractStatus.DRAFT,
  EmploymentContractStatus.PENDING_HR_SIGNATURE,
  EmploymentContractStatus.PENDING_EMPLOYEE_SIGNATURE,
  EmploymentContractStatus.PENDING_VERIFICATION,
  EmploymentContractStatus.ISSUED,
];

export function todayInTanzania(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export type ContractExitInput = {
  companyId: number;
  employeeId: number;
  exitDate: string;
  reason: string | null;
  source: 'offboarding' | 'status_change';
  sourceEntityId?: number | null;
  actorCompanyUserId?: number | null;
};

/**
 * Ends an exiting employee's contracts inside the caller's transaction.
 * - The signed contract ends on the exit date: TERMINATED now if that date
 *   has arrived, otherwise scheduled (ended_at set) and closed by the daily job.
 * - Unfinished contracts are CANCELLED at once so they cannot be signed.
 * Each change goes to the employment history and the security log.
 */
@Injectable()
export class ContractExitService {
  constructor(
    private readonly history: EmploymentHistoryService,
    @Optional() private readonly securityEvents?: SecurityEventsService,
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  async endContractsForExit(manager: EntityManager, input: ContractExitInput) {
    const repository = manager.getRepository(EmploymentContract);
    const contracts = await repository.find({
      where: {
        companyId: input.companyId,
        employeeId: input.employeeId,
        status: In([EmploymentContractStatus.SIGNED, ...UNFINISHED]),
      },
      lock: { mode: 'pessimistic_write' },
    });
    const now = new Date();
    const today = todayInTanzania();
    const reason = (input.reason?.trim() || 'Employee exited').slice(0, 280);
    const ended: number[] = [];
    const scheduled: number[] = [];
    const cancelled: number[] = [];

    for (const contract of contracts) {
      const previousStatus = contract.status;
      if (contract.status === EmploymentContractStatus.SIGNED) {
        contract.endedAt = input.exitDate;
        contract.endReason = reason;
        contract.offboardingRequestId =
          input.source === 'offboarding'
            ? (input.sourceEntityId ?? null)
            : contract.offboardingRequestId;
        if (input.exitDate <= today) {
          contract.status = assertTransition(
            contract.status,
            ContractAction.TERMINATE,
          );
          ended.push(contract.id);
        } else scheduled.push(contract.id);
      } else {
        contract.status = assertTransition(
          contract.status,
          ContractAction.CANCEL,
        );
        contract.cancelledAt = now;
        contract.cancelledByCompanyUserId = input.actorCompanyUserId ?? null;
        contract.cancelReason = `Employee exited: ${reason}`.slice(0, 500);
        cancelled.push(contract.id);
      }
      await repository.save(contract);
      const title =
        previousStatus !== EmploymentContractStatus.SIGNED
          ? 'Unsigned contract cancelled on exit'
          : contract.status === EmploymentContractStatus.TERMINATED
            ? 'Contract terminated on exit'
            : `Contract scheduled to end on ${input.exitDate}`;
      await this.history.record(
        {
          companyId: input.companyId,
          employeeId: input.employeeId,
          eventType: EmploymentEventTypeEnum.CONTRACT_ENDED,
          title,
          effectiveDate: input.exitDate,
          sourceModule: 'contracts',
          sourceEntityType: 'EMPLOYMENT_CONTRACT',
          sourceEntityId: contract.id,
          oldValues: { status: previousStatus },
          newValues: {
            status: contract.status,
            reference_no: contract.referenceNo,
            version: contract.version,
            exit_date: input.exitDate,
            reason,
            source: input.source,
            source_entity_id: input.sourceEntityId ?? null,
          },
          dedupeKey: `contract:exit:${contract.id}`,
          actorCompanyUserId: input.actorCompanyUserId ?? undefined,
        },
        manager,
      );
    }
    if (cancelled.length) {
      await manager
        .getRepository(ContractSigningChallenge)
        .createQueryBuilder()
        .update()
        .set({ consumedAt: now })
        .where('contract_id IN (:...ids) AND consumed_at IS NULL', {
          ids: cancelled,
        })
        .execute();
    }
    if (contracts.length)
      await this.securityEvents?.log(
        {
          eventType: SecurityEventType.EMPLOYEE_UPDATED,
          outcome: SecurityEventOutcome.SUCCESS,
          companyId: input.companyId,
          resourceType: 'employment_contract',
          resourceId: input.employeeId,
          metadata: {
            action: 'end_on_exit',
            actor_company_user_id: input.actorCompanyUserId ?? null,
            exit_date: input.exitDate,
            source: input.source,
            source_entity_id: input.sourceEntityId ?? null,
            terminated_contract_ids: ended,
            scheduled_contract_ids: scheduled,
            cancelled_contract_ids: cancelled,
          },
        },
        manager,
      );
    return {
      terminated_contract_ids: ended,
      scheduled_contract_ids: scheduled,
      cancelled_contract_ids: cancelled,
    };
  }

  /** Daily: close signed contracts whose scheduled end date has arrived. */
  async closeScheduledEnds(today = todayInTanzania()) {
    if (!this.dataSource) return 0;
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(EmploymentContract);
      const due = await repository.find({
        where: {
          status: EmploymentContractStatus.SIGNED,
          endedAt: Not(IsNull()) as never,
        },
        lock: { mode: 'pessimistic_write' },
      });
      let closed = 0;
      for (const contract of due.filter(
        (row) => row.endedAt && row.endedAt <= today,
      )) {
        contract.status = assertTransition(
          contract.status,
          ContractAction.TERMINATE,
        );
        await repository.save(contract);
        await this.history.record(
          {
            companyId: contract.companyId,
            employeeId: contract.employeeId,
            eventType: EmploymentEventTypeEnum.CONTRACT_ENDED,
            title: 'Contract terminated on exit',
            effectiveDate: contract.endedAt!,
            sourceModule: 'contracts',
            sourceEntityType: 'EMPLOYMENT_CONTRACT',
            sourceEntityId: contract.id,
            oldValues: { status: EmploymentContractStatus.SIGNED },
            newValues: {
              status: contract.status,
              reference_no: contract.referenceNo,
              reason: contract.endReason,
              offboarding_request_id: contract.offboardingRequestId,
            },
            dedupeKey: `contract:exit-closed:${contract.id}`,
          },
          manager,
        );
        closed += 1;
      }
      return closed;
    });
  }
}
