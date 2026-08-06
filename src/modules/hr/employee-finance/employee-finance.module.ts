import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeCompensationVersion } from '../employee-movements/entities/employee-compensation-version.entity';
import { Employee } from '../employees/entities/employee.entity';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { OffboardingSettlementItem } from '../offboarding/entities/offboarding-settlement-item.entity';
import { PayrollPeriod } from '../payroll/entities/payroll-configuration.entities';
import { EmployeePayrollResult } from '../payroll/entities/payroll-run.entities';
import { HrSharedModule } from '../shared/hr-shared.module';
import {
  EmployeeFinanceApplicationsController,
  EmployeeFinanceProductsController,
  EmployeeFinanceReconciliationController,
  EmployeeFinanceReportsController,
  FinanceEmployeeFinanceController,
  HrEmployeeFinanceController,
  ManagerEmployeeFinanceController,
  MyEmployeeFinanceController,
} from './controllers/employee-finance.controllers';
import {
  EmployeeFinanceAccount,
  EmployeeFinanceAuditLog,
  EmployeeFinanceDefermentRequest,
  EmployeeFinanceDisbursement,
  EmployeeFinanceExitRecovery,
  EmployeeFinanceInstallment,
  EmployeeFinanceLedgerEntry,
  EmployeeFinancePayrollInstruction,
  EmployeeFinanceRepayment,
  EmployeeFinanceRepaymentAllocation,
  EmployeeFinanceReschedule,
  EmployeeFinanceSettlementQuote,
} from './entities/employee-finance-account.entities';
import {
  EmployeeFinanceApplication,
  EmployeeFinanceApplicationApproval,
  EmployeeFinanceApplicationDocument,
} from './entities/employee-finance-application.entities';
import {
  EmployeeFinanceProduct,
  EmployeeFinanceProductApplicability,
} from './entities/employee-finance-product.entities';
import {
  EmployeeFinanceAccountService,
  EmployeeFinanceApplicationService,
  EmployeeFinanceApprovalService,
  EmployeeFinanceAuditService,
  EmployeeFinanceDefermentService,
  EmployeeFinanceDisbursementService,
  EmployeeFinanceEligibilityService,
  EmployeeFinanceExitRecoveryService,
  EmployeeFinanceInterestService,
  EmployeeFinanceLedgerService,
  EmployeeFinancePayrollInstructionService,
  EmployeeFinanceProductService,
  EmployeeFinanceReconciliationService,
  EmployeeFinanceRepaymentService,
  EmployeeFinanceReportsService,
  EmployeeFinanceRescheduleService,
  EmployeeFinanceSettlementService,
} from './services/employee-finance-core.services';

const employeeFinanceEntities = [
  EmployeeFinanceProduct,
  EmployeeFinanceProductApplicability,
  EmployeeFinanceApplication,
  EmployeeFinanceApplicationDocument,
  EmployeeFinanceApplicationApproval,
  EmployeeFinanceAccount,
  EmployeeFinanceDisbursement,
  EmployeeFinanceInstallment,
  EmployeeFinanceLedgerEntry,
  EmployeeFinanceRepayment,
  EmployeeFinanceRepaymentAllocation,
  EmployeeFinancePayrollInstruction,
  EmployeeFinanceDefermentRequest,
  EmployeeFinanceReschedule,
  EmployeeFinanceSettlementQuote,
  EmployeeFinanceExitRecovery,
  EmployeeFinanceAuditLog,
  Employee,
  EmployeeCompensationVersion,
  EmployeePayrollResult,
  PayrollPeriod,
  OffboardingRequest,
  OffboardingSettlementItem,
];

const employeeFinanceProviders = [
  EmployeeFinanceAuditService,
  EmployeeFinanceProductService,
  EmployeeFinanceEligibilityService,
  EmployeeFinanceInterestService,
  EmployeeFinanceLedgerService,
  EmployeeFinanceAccountService,
  EmployeeFinanceApplicationService,
  EmployeeFinanceApprovalService,
  EmployeeFinanceDisbursementService,
  EmployeeFinancePayrollInstructionService,
  EmployeeFinanceRepaymentService,
  EmployeeFinanceSettlementService,
  EmployeeFinanceDefermentService,
  EmployeeFinanceRescheduleService,
  EmployeeFinanceExitRecoveryService,
  EmployeeFinanceReportsService,
  EmployeeFinanceReconciliationService,
];

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature(employeeFinanceEntities),
    HrSharedModule,
  ],
  controllers: [
    EmployeeFinanceProductsController,
    MyEmployeeFinanceController,
    EmployeeFinanceApplicationsController,
    ManagerEmployeeFinanceController,
    HrEmployeeFinanceController,
    FinanceEmployeeFinanceController,
    EmployeeFinanceReportsController,
    EmployeeFinanceReconciliationController,
  ],
  providers: employeeFinanceProviders,
  exports: [
    TypeOrmModule,
    EmployeeFinancePayrollInstructionService,
    EmployeeFinanceReportsService,
    EmployeeFinanceReconciliationService,
  ],
})
export class EmployeeFinanceModule {}
