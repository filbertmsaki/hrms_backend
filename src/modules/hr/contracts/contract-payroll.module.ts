import { Module } from '@nestjs/common';
import { ContractPayrollWarningsService } from './contract-payroll-warnings.service';

/** Contract checks used by payroll; no dependency on the contracts module. */
@Module({
  providers: [ContractPayrollWarningsService],
  exports: [ContractPayrollWarningsService],
})
export class ContractPayrollModule {}
