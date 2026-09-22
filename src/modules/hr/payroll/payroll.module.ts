import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceHoliday } from '../attendance/holidays/entities/holiday.entity';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { EmployeeFinanceModule } from '../employee-finance/employee-finance.module';
import {
  EmployeeFinanceLedgerEntry,
  EmployeeFinancePayrollInstruction,
} from '../employee-finance/entities/employee-finance-account.entities';
import { EmployeeCompensationVersion } from '../employee-movements/entities/employee-compensation-version.entity';
import { EmployeeBankAccount } from '../employees/entities/employee-bank-account.entity';
import { Employee } from '../employees/entities/employee.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { OffboardingSettlementItem } from '../offboarding/entities/offboarding-settlement-item.entity';
import { EmployeeKpi } from '../performance/entities/employee-kpi.entity';
import { KpiAchievement } from '../performance/entities/kpi-achievement.entity';
import { PerformanceAggregate } from '../performance/entities/performance-aggregate.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import {
  EmployeePayrollController,
  MyPayslipsController,
  PayrollAccountingController,
  PayrollBankingController,
  PayrollConfigurationController,
  PayrollInputsController,
  PayrollOvertimeApprovalsController,
  PayrollReportsController,
  PayrollRunsController,
  PayrollSourcesController,
  PayslipsController,
} from './controllers/payroll.controllers';
import { EmployeePayrollProfile } from './entities/employee-payroll-profile.entity';
import {
  PayrollAccountingMapping,
  PayrollBonusScheme,
  PayrollCalendar,
  PayrollComponent,
  PayrollGroup,
  PayrollGroupAssignment,
  PayrollLeaveRule,
  PayrollOvertimePolicy,
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
  PayrollPaymentReconciliation,
  PayrollResultAdjustment,
  PayrollRun,
  PayrollRunApproval,
  PayrollSourceRecord,
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
  PayrollOvertimeApprovalService,
  PayrollProrationService,
  PayrollReconciliationService,
  PayrollReportsService,
  PayrollRunService,
  PayrollSourceService,
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
      PayrollGroup,
      PayrollGroupAssignment,
      PayrollOvertimePolicy,
      PayrollBonusScheme,
      PayrollLeaveRule,
      PayrollJournalBatch,
      PayrollPaymentReconciliation,
      PayrollSourceRecord,
      PayrollVarianceResult,
      PayrollFinalSettlement,
      PayrollAuditLog,
      Employee,
      EmployeeBankAccount,
      EmployeeCompensationVersion,
      AttendanceHoliday,
      AttendanceDailySummary,
      LeaveRequest,
      EmployeeKpi,
      KpiAchievement,
      PerformanceAggregate,
      OffboardingRequest,
      OffboardingSettlementItem,
      EmployeeFinancePayrollInstruction,
      EmployeeFinanceLedgerEntry,
    ]),
    HrSharedModule,
    EmployeeFinanceModule,
  ],
  controllers: [
    PayrollConfigurationController,
    EmployeePayrollController,
    PayrollInputsController,
    PayrollSourcesController,
    PayrollOvertimeApprovalsController,
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
    PayrollSourceService,
    PayrollOvertimeApprovalService,
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
