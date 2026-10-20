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
import { LeaveApprovalWorkflowStep } from './entities/leave-approval-workflow-step.entity';
import { LeaveApprovalWorkflow } from './entities/leave-approval-workflow.entity';
import { LeaveAuditLog } from './entities/leave-audit-log.entity';
import { LeaveBalanceAdjustment } from './entities/leave-balance-adjustment.entity';
import { LeaveBalanceImportBatch } from './entities/leave-balance-import-batch.entity';
import { LeaveBalanceImportRow } from './entities/leave-balance-import-row.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveBalanceTransaction } from './entities/leave-balance-transaction.entity';
import { LeaveDocument } from './entities/leave-document.entity';
import { LeaveMedicalDetail } from './entities/leave-medical-detail.entity';
import { LeavePolicyType } from './entities/leave-policy-type.entity';
import { LeavePolicy } from './entities/leave-policy.entity';
import { LeaveNumberSequence } from './entities/leave-number-sequence.entity';
import { LeaveRequestApproval } from './entities/leave-request-approval.entity';
import { LeaveRequest } from './entities/leave-request.entity';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      LeaveType,
      LeavePolicy,
      LeavePolicyType,
      LeaveNumberSequence,
      LeaveBalance,
      LeaveBalanceAdjustment,
      LeaveBalanceImportBatch,
      LeaveBalanceImportRow,
      LeaveBalanceTransaction,
      LeaveRequest,
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
    ]),
    FilesModule,
    NotificationsModule,
    HrSharedModule,
    ConditionalBullModule.registerQueue(LEAVE_BALANCE_IMPORT_QUEUE),
    forwardRef(() => AttendanceProcessingModule),
  ],
  controllers: [LeaveController],
  providers: [
    LeaveService,
    LeaveEvidenceCronService,
    PostgresAdvisoryLockService,
    LeaveAuditService,
    LeaveBalanceCronService,
    LeaveBalanceLedgerService,
    LeaveBalanceService,
    LeaveDurationCalculatorService,
    LeaveWorkflowService,
    LeavePdfService,
    LeaveImportService,
    LeaveBalanceImportService,
    LeaveBalanceImportProcessor,
  ],
  exports: [
    LeaveService,
    LeaveBalanceLedgerService,
    LeaveBalanceService,
    TypeOrmModule,
  ],
})
export class LeaveModule {}
