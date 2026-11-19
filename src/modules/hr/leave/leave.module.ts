import { LeaveOperationsController } from './leave-operations.controller';
import { LeaveEncashmentAutoHandoffCron } from './services/leave-encashment-auto-handoff.cron';
import {
  LeaveSignaturesController,
  MyLeaveSignaturesController,
} from './leave-signatures.controller';
import { LeaveSignature } from './entities/leave-signature.entity';
import { LeaveSignatureService } from './services/leave-signature.service';
import { LeaveCompOffController } from './leave-comp-off.controller';
import {
  LeaveCompOffCredit,
  LeaveCompOffPolicy,
} from './entities/leave-comp-off.entity';
import { LeaveAllocationBackfillEntry } from './entities/leave-allocation-backfill-entry.entity';
import {
  LeaveCompOffExpiryCron,
  LeaveCompOffServiceProvider,
} from './services/leave-comp-off.providers';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from '../../files/files.module';
import { Company } from '../../companies/entities/company.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { CompanyUserRole } from '../../companies/entities/company-user-role.entity';
import { Role } from '../../roles/entities/role.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeePosition } from '../employees/entities/employee-position.entity';
import { EmployeeGrade } from '../grades/entities/employee-grade.entity';
import { Position } from '../positions/entities/position.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { AttendanceProcessingModule } from '../attendance/processing/attendance-processing.module';
import { AttendanceRecalculationJob } from '../attendance/processing/entities/attendance-recalculation-job.entity';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceHoliday } from '../attendance/holidays/entities/holiday.entity';
import { HolidayGroup } from '../attendance/holidays/entities/holiday-group.entity';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { LeaveManagementRulesController } from './leave-management-rules.controller';
import { LeaveManagementRuleService } from './services/leave-management-rule.service';
import { LeaveCarryForwardController } from './leave-carry-forward.controller';
import { LeaveCarryForwardService } from './services/leave-carry-forward.service';
import { LeaveApprovalReminderService } from './services/leave-approval-reminder.service';
import { LeaveAutoApprovalService } from './services/leave-auto-approval.service';
import { LeaveDelegationService } from './services/leave-delegation.service';
import { LeaveDelegationsController } from './leave-delegations.controller';
import { LeaveActingAssignmentService } from './services/leave-acting-assignment.service';
import { LeaveActingAssignmentsController } from './leave-acting-assignments.controller';
import { LeaveRecalculationService } from './services/leave-recalculation.service';
import {
  LeaveAccrualController,
  LeaveRecalculationController,
} from './leave-recalculation.controller';
import { LeaveReportsController } from './leave-reports.controller';
import { LeaveOpeningReviewsController } from './leave-opening-reviews.controller';
import { LeaveOpeningReviewService } from './services/leave-opening-review.service';
import { LeaveReportService } from './services/leave-report.service';
import { LeaveExitSettlementService } from './services/leave-exit-settlement.service';
import { LeaveExitSettlementsController } from './leave-exit-settlements.controller';
import { LeaveVerificationController } from './leave-verification.controller';
import { LeaveVerificationService } from './services/leave-verification.service';
import { LeaveApprovalWorkflowStep } from './entities/leave-approval-workflow-step.entity';
import { LeaveApprovalWorkflow } from './entities/leave-approval-workflow.entity';
import { LeaveAuditLog } from './entities/leave-audit-log.entity';
import { LeaveBalanceAdjustment } from './entities/leave-balance-adjustment.entity';
import { LeaveBalanceImportBatch } from './entities/leave-balance-import-batch.entity';
import { LeaveBalanceImportRow } from './entities/leave-balance-import-row.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveBalanceTransaction } from './entities/leave-balance-transaction.entity';
import { LeaveEncashmentRequest } from './entities/leave-encashment-request.entity';
import { LeaveDocument } from './entities/leave-document.entity';
import { LeaveMedicalDetail } from './entities/leave-medical-detail.entity';
import { LeavePolicyType } from './entities/leave-policy-type.entity';
import { LeavePolicy } from './entities/leave-policy.entity';
import { LeaveNumberSequence } from './entities/leave-number-sequence.entity';
import { LeaveRequestApproval } from './entities/leave-request-approval.entity';
import { LeaveRequest } from './entities/leave-request.entity';
import { LeaveVerificationRevocation } from './entities/leave-verification-revocation.entity';
import { LeaveType } from './entities/leave-type.entity';
import { LeaveAuditService } from './services/leave-audit.service';
import { LeaveBalanceCronService } from './services/leave-balance-cron.service';
import { LeaveBalanceLedgerService } from './services/leave-balance-ledger.service';
import { LeaveBalanceService } from './services/leave-balance.service';
import { LeaveDurationCalculatorService } from './services/leave-duration-calculator.service';
import { LeavePdfService } from './services/leave-pdf.service';
import { LeaveWorkflowService } from './services/leave-workflow.service';
import { LeaveImportService } from './services/leave-import.service';
import { LeaveBalanceImportService } from './services/leave-balance-import.service';
import { LeaveBalanceImportProcessor } from './services/leave-balance-import.processor';
import { LEAVE_BALANCE_IMPORT_QUEUE } from './services/leave-balance-import-job.constants';
import { ConditionalBullModule } from '../../../infrastructure/queues/conditional-bull.module';

import { NotificationsModule } from '../../notifications/notifications.module';
import { LeaveEvidenceCronService } from './services/leave-evidence-cron.service';
import { PostgresAdvisoryLockService } from '../../../common/database/postgres-advisory-lock.service';

import { LeaveEngineController } from './leave-engine.controller';
import { LeaveRolloverLine } from './entities/leave-rollover-line.entity';
import { LeaveRolloverRun } from './entities/leave-rollover-run.entity';
import { LeaveStatutoryCompanySettings } from './entities/leave-statutory-company-settings.entity';
import { LeaveStatutoryRule } from './entities/leave-statutory-rule.entity';
import { LeaveStatutoryRuleSet } from './entities/leave-statutory-rule-set.entity';
import { LeaveEncashmentCalculatorService } from './services/leave-encashment-calculator.service';
import { LeaveEncashmentPaymentSyncService } from './services/leave-encashment-payment-sync.service';
import { LeaveRolloverService } from './services/leave-rollover.service';
import { LeaveStatutoryService } from './services/leave-statutory.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      LeaveCompOffPolicy,
      LeaveSignature,
      LeaveCompOffCredit,
      LeaveAllocationBackfillEntry,
      LeaveType,
      LeavePolicy,
      LeavePolicyType,
      LeaveNumberSequence,
      LeaveBalance,
      LeaveBalanceAdjustment,
      LeaveBalanceImportBatch,
      LeaveBalanceImportRow,
      LeaveBalanceTransaction,
      LeaveEncashmentRequest,
      LeaveRequest,
      LeaveVerificationRevocation,
      LeaveApprovalWorkflow,
      LeaveApprovalWorkflowStep,
      LeaveRequestApproval,
      LeaveMedicalDetail,
      LeaveDocument,
      LeaveAuditLog,
      Employee,
      EmployeePosition,
      EmployeeGrade,
      Branch,
      Department,
      Position,
      CompanyUser,
      CompanyUserRole,
      Role,
      AttendanceDailySummary,
      AttendanceRecalculationJob,
      AttendanceHoliday,
      HolidayGroup,
      LeaveRolloverRun,
      LeaveRolloverLine,
      LeaveStatutoryRuleSet,
      LeaveStatutoryRule,
      LeaveStatutoryCompanySettings,
    ]),
    FilesModule,
    NotificationsModule,
    HrSharedModule,
    ConditionalBullModule.registerQueue(LEAVE_BALANCE_IMPORT_QUEUE),
    forwardRef(() => AttendanceProcessingModule),
  ],
  controllers: [
    LeaveController,
    LeaveManagementRulesController,
    LeaveCarryForwardController,
    LeaveDelegationsController,
    LeaveActingAssignmentsController,
    LeaveRecalculationController,
    LeaveAccrualController,
    LeaveReportsController,
    LeaveOpeningReviewsController,
    LeaveExitSettlementsController,
    LeaveVerificationController,
    LeaveEngineController,
    LeaveCompOffController,
    LeaveSignaturesController,
    MyLeaveSignaturesController,
    LeaveOperationsController,
  ],
  providers: [
    LeaveService,
    LeaveEncashmentAutoHandoffCron,
    LeaveVerificationService,
    LeaveEvidenceCronService,
    PostgresAdvisoryLockService,
    LeaveAuditService,
    LeaveManagementRuleService,
    LeaveCarryForwardService,
    LeaveApprovalReminderService,
    LeaveAutoApprovalService,
    LeaveDelegationService,
    LeaveActingAssignmentService,
    LeaveRecalculationService,
    LeaveReportService,
    LeaveOpeningReviewService,
    LeaveExitSettlementService,
    LeaveBalanceCronService,
    LeaveBalanceLedgerService,
    LeaveBalanceService,
    LeaveDurationCalculatorService,
    LeaveWorkflowService,
    LeavePdfService,
    LeaveImportService,
    LeaveBalanceImportService,
    LeaveBalanceImportProcessor,
    LeaveStatutoryService,
    LeaveEncashmentCalculatorService,
    LeaveEncashmentPaymentSyncService,
    LeaveRolloverService,
    LeaveCompOffServiceProvider,
    LeaveCompOffExpiryCron,
    LeaveSignatureService,
  ],
  exports: [
    LeaveService,
    LeaveBalanceLedgerService,
    LeaveBalanceService,
    LeaveStatutoryService,
    TypeOrmModule,
  ],
})
export class LeaveModule {}
