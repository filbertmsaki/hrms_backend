import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeCompensationVersion } from '../employee-movements/entities/employee-compensation-version.entity';
import { Employee } from '../employees/entities/employee.entity';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { OffboardingSettlementItem } from '../offboarding/entities/offboarding-settlement-item.entity';
import { PayrollPeriod } from '../payroll/entities/payroll-configuration.entities';
import {
  EmployeePayrollLineItem,
  EmployeePayrollResult,
  PayrollRun,
} from '../payroll/entities/payroll-run.entities';
import { Department } from '../departments/entities/department.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { FilesModule } from '../../files/files.module';
import {
  EmployeeFinanceApplicationsController,
  EmployeeFinanceDelegationsController,
  EmployeeFinancePayrollController,
  EmployeeFinanceProductsController,
  EmployeeFinanceReconciliationController,
  EmployeeFinanceReportsController,
  EmployeeFinanceIntegrationsController,
  EmployeeFinanceLoanReportsController,
  EmployeeFinanceMigrationController,
  EmployeeFinanceTemplatesController,
  FinanceEmployeeFinanceController,
  HrEmployeeFinanceController,
  ManagementEmployeeFinanceController,
  ManagerEmployeeFinanceController,
  MyEmployeeFinanceController,
} from './controllers/employee-finance.controllers';
import {
  EmployeeFinanceAdjustment,
  EmployeeFinanceApprovalDelegation,
  EmployeeFinanceLetterTemplate,
} from './entities/employee-finance-servicing.entities';
import {
  EmployeeFinanceAccountStatusService,
  EmployeeFinanceDelegationService,
  EmployeeFinanceLetterTemplateService,
  EmployeeFinanceNotifierService,
  EmployeeFinancePermissionDirectoryService,
} from './services/employee-finance-policy.services';
import {
  EmployeeFinanceAdjustmentService,
  EmployeeFinanceEscalationService,
  EmployeeFinancePayrollOpsService,
} from './services/employee-finance-workflow.services';
import { EmployeeFinanceLoanReportsService } from './services/employee-finance-reporting.services';
import { EmployeeFinanceIntegrationService } from './services/employee-finance-integration.services';
import { EmployeeFinanceMigrationService } from './services/employee-finance-migration.services';
import {
  EmployeeFinanceIntegrationLog,
  EmployeeFinanceIntegrationSettings,
} from './entities/employee-finance-integration.entities';
import { EmployeeBankAccount } from '../employees/entities/employee-bank-account.entity';
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
  EmployeeFinanceApplicationGuarantor,
  EmployeeFinanceSanctionLetter,
} from './entities/employee-finance-application.entities';
import {
  EmployeeFinanceProduct,
  EmployeeFinanceProductApplicability,
} from './entities/employee-finance-product.entities';
import {
  EmployeeFinanceAccountService,
  EmployeeFinanceAccountingPostingService,
  EmployeeFinanceApplicationService,
  EmployeeFinanceApprovalService,
  EmployeeFinanceAuditService,
  EmployeeFinanceDefermentService,
  EmployeeFinanceDisbursementService,
  EmployeeFinanceEligibilityService,
  EmployeeFinanceExitRecoveryService,
  EmployeeFinanceInterestService,
  EmployeeFinanceLedgerService,
  EmployeeFinancePaymentImportService,
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
  EmployeeFinanceApplicationGuarantor,
  EmployeeFinanceApplicationApproval,
  EmployeeFinanceSanctionLetter,
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
  EmployeeFinanceLetterTemplate,
  EmployeeFinanceApprovalDelegation,
  EmployeeFinanceAdjustment,
  EmployeeFinanceIntegrationSettings,
  EmployeeFinanceIntegrationLog,
  EmployeeBankAccount,
  Employee,
  Department,
  EmployeeCompensationVersion,
  EmployeePayrollResult,
  EmployeePayrollLineItem,
  PayrollRun,
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
  EmployeeFinancePaymentImportService,
  EmployeeFinanceAccountingPostingService,
  EmployeeFinanceReportsService,
  EmployeeFinanceReconciliationService,
  EmployeeFinancePermissionDirectoryService,
  EmployeeFinanceNotifierService,
  EmployeeFinanceLetterTemplateService,
  EmployeeFinanceDelegationService,
  EmployeeFinanceAccountStatusService,
  EmployeeFinanceEscalationService,
  EmployeeFinanceAdjustmentService,
  EmployeeFinancePayrollOpsService,
  EmployeeFinanceLoanReportsService,
  EmployeeFinanceIntegrationService,
  EmployeeFinanceMigrationService,
];

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature(employeeFinanceEntities),
    HrSharedModule,
    FilesModule,
  ],
  controllers: [
    EmployeeFinanceProductsController,
    MyEmployeeFinanceController,
    EmployeeFinanceApplicationsController,
    ManagerEmployeeFinanceController,
    HrEmployeeFinanceController,
    ManagementEmployeeFinanceController,
    FinanceEmployeeFinanceController,
    EmployeeFinanceReportsController,
    EmployeeFinanceReconciliationController,
    EmployeeFinancePayrollController,
    EmployeeFinanceDelegationsController,
    EmployeeFinanceTemplatesController,
    EmployeeFinanceLoanReportsController,
    EmployeeFinanceIntegrationsController,
    EmployeeFinanceMigrationController,
  ],
  providers: employeeFinanceProviders,
  exports: [
    TypeOrmModule,
    EmployeeFinancePayrollInstructionService,
    EmployeeFinanceLedgerService,
    EmployeeFinanceReportsService,
    EmployeeFinanceReconciliationService,
    EmployeeFinanceExitRecoveryService,
  ],
})
export class EmployeeFinanceModule {}
