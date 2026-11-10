import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TwoFaModule } from '../../auth/2fa/2fa.module';
import { Company } from '../../companies/entities/company.entity';
import { MailModule } from '../../mail/mail.module';
import { AppNotification } from '../../notifications/entities/app-notification.entity';
import { Document } from '../documents/entities/document.entity';
import { HrDocumentsModule } from '../documents/hr-documents.module';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeAddress } from '../employees/entities/employee-address.entity';
import { EmployeeCompensationVersion } from '../employee-movements/entities/employee-compensation-version.entity';
import { EmploymentHistoryModule } from '../employment-history/employment-history.module';
import { HrSharedModule } from '../shared/hr-shared.module';
import { ContractDocumentService } from './contract-document.service';
import { ContractExitModule } from './contract-exit.module';
import { ContractMovementListener } from './contract-movement.listener';
import { ContractNotifierService } from './contract-notifier.service';
import { ContractPayrollModule } from './contract-payroll.module';
import { ContractRemindersService } from './contract-reminders.service';
import { ContractSettingsService } from './contract-settings.service';
import { ContractSignatoriesService } from './contract-signatories.service';
import { ContractSigningService } from './contract-signing.service';
import { ContractTemplatesService } from './contract-templates.service';
import { ContractSignatory } from './entities/contract-signatory.entity';
import { ContractSignature } from './entities/contract-signature.entity';
import { ContractSigningChallenge } from './entities/contract-signing-challenge.entity';
import { EmploymentContract } from './entities/employment-contract.entity';
import { EmploymentLetterTemplate } from './entities/employment-letter-template.entity';
import {
  ContractSignatoriesController,
  EmploymentContractsController,
} from './employment-contracts.controller';
import { EmploymentContractsService } from './employment-contracts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmploymentContract,
      ContractSignatory,
      ContractSignature,
      ContractSigningChallenge,
      EmploymentLetterTemplate,
      Employee,
      EmployeeAddress,
      EmployeeCompensationVersion,
      AppNotification,
      Company,
      Document,
    ]),
    HrDocumentsModule,
    HrSharedModule,
    EmploymentHistoryModule,
    MailModule,
    TwoFaModule,
    ContractExitModule,
    ContractPayrollModule,
  ],
  controllers: [EmploymentContractsController, ContractSignatoriesController],
  providers: [
    EmploymentContractsService,
    ContractSettingsService,
    ContractTemplatesService,
    ContractDocumentService,
    ContractSigningService,
    ContractSignatoriesService,
    ContractNotifierService,
    ContractRemindersService,
    ContractMovementListener,
  ],
  exports: [
    EmploymentContractsService,
    ContractSettingsService,
    ContractSigningService,
  ],
})
export class EmploymentContractsModule {}
