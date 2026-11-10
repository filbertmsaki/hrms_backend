import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { EmployeeMovement } from '../employee-movements/entities/employee-movement.entity';
import { EmployeeMovementTypeEnum } from '../employee-movements/enums/employee-movement-type.enum';
import { EmployeeMovementAppliedEvent } from '../notifications/events/employee-movement.events';
import { ContractNotifierService } from './contract-notifier.service';
import {
  EmploymentContract,
  EmploymentContractStatus,
} from './entities/employment-contract.entity';

/** Movements that change terms printed in the contract. */
export const CONTRACT_AFFECTING_MOVEMENTS = new Set<string>([
  EmployeeMovementTypeEnum.DEPARTMENT_TRANSFER,
  EmployeeMovementTypeEnum.BRANCH_TRANSFER,
  EmployeeMovementTypeEnum.POSITION_CHANGE,
  EmployeeMovementTypeEnum.PROMOTION,
  EmployeeMovementTypeEnum.DEMOTION,
  EmployeeMovementTypeEnum.REPORTING_MANAGER_CHANGE,
  EmployeeMovementTypeEnum.GRADE_CHANGE,
  EmployeeMovementTypeEnum.EMPLOYMENT_TYPE_CHANGE,
  EmployeeMovementTypeEnum.SALARY_REVISION,
  EmployeeMovementTypeEnum.COMPOSITE,
]);

/**
 * When a promotion, transfer or salary change is applied, suggest a
 * contract amendment to HR. Nothing is changed automatically.
 */
@Injectable()
export class ContractMovementListener {
  private readonly logger = new Logger(ContractMovementListener.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifier: ContractNotifierService,
  ) {}

  @OnEvent(EmployeeMovementAppliedEvent.EVENT, { async: true })
  async onMovementApplied(event: EmployeeMovementAppliedEvent) {
    try {
      await this.suggestAmendment(event.companyId, event.movementId);
    } catch (error) {
      this.logger.warn(
        `Contract amendment suggestion failed for movement ${event.movementId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async suggestAmendment(companyId: number, movementId: number) {
    const movement = await this.dataSource
      .getRepository(EmployeeMovement)
      .findOneBy({ id: movementId, companyId });
    if (!movement || !CONTRACT_AFFECTING_MOVEMENTS.has(movement.movementType))
      return false;
    const contract = await this.dataSource
      .getRepository(EmploymentContract)
      .findOne({
        where: {
          companyId,
          employeeId: movement.employeeId,
          status: EmploymentContractStatus.SIGNED,
        },
        order: { version: 'DESC' },
      });
    if (!contract?.issuedByCompanyUserId) return false;
    return this.notifier.notify({
      companyId,
      receiverCompanyUserId: contract.issuedByCompanyUserId,
      contractId: contract.id,
      title: 'Contract amendment suggested',
      message: `A ${movement.movementType.replace(/_/g, ' ').toLowerCase()} was applied for contract ${contract.referenceNo}. Review whether the contract needs an amendment.`,
      actionUrl: `/dashboard/employees/contracts/${contract.id}?amend_movement=${movement.id}`,
      dedupeKey: `contract:amend-suggested:${contract.id}:${movement.id}`,
      metadata: { movement_id: movement.id },
    });
  }
}
