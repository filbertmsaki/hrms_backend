import { Module } from '@nestjs/common';
import { EmploymentHistoryModule } from '../employment-history/employment-history.module';
import { ContractExitService } from './contract-exit.service';

/** Kept separate so employees/offboarding can use it without importing the contracts module. */
@Module({
  imports: [EmploymentHistoryModule],
  providers: [ContractExitService],
  exports: [ContractExitService],
})
export class ContractExitModule {}
