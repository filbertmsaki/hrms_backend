import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { EmployeeFinanceModule } from '../employee-finance/employee-finance.module';
import { EmployeeCompensationVersion } from '../employee-movements/entities/employee-compensation-version.entity';
import { EmployeeBankAccount } from '../employees/entities/employee-bank-account.entity';
import { Employee } from '../employees/entities/employee.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { OffboardingSettlementItem } from '../offboarding/entities/offboarding-settlement-item.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import {
  EmployeePayrollController,
  MyPayslipsController,
  PayrollAccountingController,
  PayrollBankingController,
  PayrollConfigurationController,
  PayrollInputsController,
  PayrollReportsController,
  PayrollRunsController,
  PayslipsController,
} from './controllers/payroll.controllers';
import { EmployeePayrollProfile } from './entities/employee-payroll-profile.entity';
import {
  PayrollAccountingMapping,
  PayrollCalendar,
  PayrollComponent,
  PayrollPeriod,
  SalaryStructure,
  SalaryStructureComponent,
  StatutoryRuleVersion,
  StatutoryScheme,
  StatutoryTaxBand,
} from './entities/payroll-configuration.entities';
import {
  EmployeePayrollLineItem,
  EmployeePayrollResult,
  PayrollAuditLog,
  PayrollBankBatch,
  PayrollDeductionShortfall,
  PayrollFinalSettlement,
  PayrollInput,
  PayrollJournalBatch,
  PayrollResultAdjustment,
  PayrollRun,
  PayrollRunApproval,
  PayrollVarianceResult,
  Payslip,
} from './entities/payroll-run.entities';
import {
  EmployeePayrollCalculationService,
  EmployeePayrollProfileService,
  PayrollAccountingService,
  PayrollAuditService,
  PayrollBankService,
  PayrollConfigurationService,
  PayrollFinalSettlementService,
  PayrollInputService,
  PayrollProrationService,
  PayrollReconciliationService,
  PayrollReportsService,
  PayrollRunService,
  PayslipService,
  ProgressiveTaxService,
  StatutoryCalculationService,
} from './services/payroll-core.services';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      EmployeePayrollProfile,
      PayrollComponent,
      SalaryStructure,
      SalaryStructureComponent,
      PayrollCalendar,
      PayrollPeriod,
      PayrollRun,
      PayrollRunApproval,
      PayrollInput,
      EmployeePayrollResult,
      EmployeePayrollLineItem,
      PayrollResultAdjustment,
      PayrollDeductionShortfall,
      StatutoryScheme,
      StatutoryRuleVersion,
      StatutoryTaxBand,
      Payslip,
      PayrollBankBatch,
      PayrollAccountingMapping,
      PayrollJournalBatch,
      PayrollVarianceResult,
      PayrollFinalSettlement,
      PayrollAuditLog,
      Employee,
      EmployeeBankAccount,
      EmployeeCompensationVersion,
      AttendanceDailySummary,
      LeaveRequest,
      OffboardingRequest,
      OffboardingSettlementItem,
    ]),
    HrSharedModule,
    EmployeeFinanceModule,
  ],
  controllers: [
    PayrollConfigurationController,
    EmployeePayrollController,
    PayrollInputsController,
    PayrollRunsController,
    PayslipsController,
    MyPayslipsController,
    PayrollBankingController,
    PayrollAccountingController,
    PayrollReportsController,
  ],
  providers: [
    PayrollAuditService,
    EmployeePayrollProfileService,
    PayrollConfigurationService,
    PayrollInputService,
    PayrollProrationService,
    ProgressiveTaxService,
    StatutoryCalculationService,
    EmployeePayrollCalculationService,
    PayrollRunService,
    PayslipService,
    PayrollBankService,
    PayrollAccountingService,
    PayrollReportsService,
    PayrollReconciliationService,
    PayrollFinalSettlementService,
  ],
  exports: [
    EmployeePayrollProfileService,
    PayrollConfigurationService,
    PayrollRunService,
    PayrollReportsService,
    PayrollReconciliationService,
    PayrollFinalSettlementService,
  ],
})
export class PayrollModule {}
