import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HrDocumentsModule } from '../documents/hr-documents.module';
import { Employee } from '../employees/entities/employee.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { EmploymentContract } from './entities/employment-contract.entity';
import { EmploymentContractsController } from './employment-contracts.controller';
import { EmploymentContractsService } from './employment-contracts.service';
import { AppNotification } from '../../notifications/entities/app-notification.entity';
import { EmploymentHistoryModule } from '../employment-history/employment-history.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmploymentContract, Employee, AppNotification]),
    HrDocumentsModule,
    HrSharedModule,
    EmploymentHistoryModule,
  ],
  controllers: [EmploymentContractsController],
  providers: [EmploymentContractsService],
  exports: [EmploymentContractsService],
})
export class EmploymentContractsModule {}
