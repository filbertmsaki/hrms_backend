import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HrDocumentsModule } from '../documents/hr-documents.module';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeAddress } from '../employees/entities/employee-address.entity';
import { EmployeeCompensationVersion } from '../employee-movements/entities/employee-compensation-version.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { EmploymentContract } from './entities/employment-contract.entity';
import { ContractSignatory } from './entities/contract-signatory.entity';
import { ContractSignature } from './entities/contract-signature.entity';
import { ContractSigningChallenge } from './entities/contract-signing-challenge.entity';
import { EmploymentContractsController } from './employment-contracts.controller';
import { EmploymentContractsService } from './employment-contracts.service';
import { AppNotification } from '../../notifications/entities/app-notification.entity';
import { EmploymentHistoryModule } from '../employment-history/employment-history.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmploymentContract,
      ContractSignatory,
      ContractSignature,
      ContractSigningChallenge,
      Employee,
      EmployeeAddress,
      EmployeeCompensationVersion,
      AppNotification,
    ]),
    HrDocumentsModule,
    HrSharedModule,
    EmploymentHistoryModule,
  ],
  controllers: [EmploymentContractsController],
  providers: [EmploymentContractsService],
  exports: [EmploymentContractsService],
})
export class EmploymentContractsModule {}
