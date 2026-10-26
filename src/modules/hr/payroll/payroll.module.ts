import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceHoliday } from '../attendance/holidays/entities/holiday.entity';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { EmployeeFinanceModule } from '../employee-finance/employee-finance.module';
import {
  EmployeeFinanceAccount,
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
import { HrDocumentsModule } from '../documents/hr-documents.module';
import { TwoFaModule } from '../../auth/2fa/2fa.module';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { NotificationsModule } from '../../notifications/notifications.module';
import {
  EmployeePayrollController,
  MyPayslipsController,
  PayrollAccountingController,
  PayrollBankingController,
  PayrollConfigurationController,
  PayrollInputsController,
  PayrollReportsController,
  PayrollRunsController,
  PayrollSourcesController,
  PayslipsController,
} from './controllers/payroll.controllers';
import { PayrollOvertimeRequestsController } from './controllers/payroll-overtime-requests.controller';
import { PayrollOvertimeRequest } from './entities/payroll-overtime-request.entity';
import { PayrollOvertimeRequestService } from './services/payroll-overtime-request.service';
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
  PayrollSecurityPolicy,
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
  PayrollGenerationChallenge,
  PayrollInput,
  PayrollIntegrationConnection,
  PayrollIntegrationSyncJob,
  PayrollIntegrationSyncLog,
  PayrollJournalBatch,
  PayrollPaymentImport,
  PayrollPaymentImportLine,
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
  EmployeeSalaryService,
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
  PayrollSourceService,
  PayslipService,
  ProgressiveTaxService,
  SalaryStructureResolver,
  StatutoryCalculationService,
} from './services/payroll-core.services';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      EmployeePayrollProfile,
      CompanyUser,
      PayrollComponent,
      SalaryStructure,
      SalaryStructureComponent,
      PayrollCalendar,
      PayrollPeriod,
      PayrollSecurityPolicy,
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
      PayrollPaymentImport,
      PayrollPaymentImportLine,
      PayrollAccountingMapping,
      PayrollGroup,
      PayrollGroupAssignment,
      PayrollOvertimePolicy,
      PayrollOvertimeRequest,
      PayrollBonusScheme,
      PayrollLeaveRule,
      PayrollJournalBatch,
      PayrollPaymentReconciliation,
      PayrollSourceRecord,
      PayrollIntegrationConnection,
      PayrollIntegrationSyncJob,
      PayrollIntegrationSyncLog,
      PayrollVarianceResult,
      PayrollFinalSettlement,
      PayrollAuditLog,
      PayrollGenerationChallenge,
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
      EmployeeFinanceAccount,
      EmployeeFinancePayrollInstruction,
      EmployeeFinanceLedgerEntry,
      EmployeePayrollProfile,
    ]),
    HrSharedModule,
    HrDocumentsModule,
    EmployeeFinanceModule,
    TwoFaModule,
    NotificationsModule,
  ],
  controllers: [
    PayrollConfigurationController,
    EmployeePayrollController,
    PayrollInputsController,
    PayrollSourcesController,
    PayrollOvertimeRequestsController,
    PayrollRunsController,
    PayslipsController,
    MyPayslipsController,
    PayrollBankingController,
    PayrollAccountingController,
    PayrollReportsController,
  ],
  providers: [
    PayrollAuditService,
    SalaryStructureResolver,
    EmployeePayrollProfileService,
    EmployeeSalaryService,
    PayrollConfigurationService,
    PayrollInputService,
    PayrollSourceService,
    PayrollOvertimeRequestService,
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
