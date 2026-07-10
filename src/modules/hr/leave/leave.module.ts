import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../../companies/entities/company.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { CompanyUserRole } from '../../companies/entities/company-user-role.entity';
import { Role } from '../../roles/entities/role.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeePosition } from '../employees/entities/employee-position.entity';
import { Position } from '../positions/entities/position.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
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
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveBalanceTransaction } from './entities/leave-balance-transaction.entity';
import { LeaveDocument } from './entities/leave-document.entity';
import { LeaveMedicalDetail } from './entities/leave-medical-detail.entity';
import { LeavePolicyType } from './entities/leave-policy-type.entity';
import { LeavePolicy } from './entities/leave-policy.entity';
import { LeaveRequestApproval } from './entities/leave-request-approval.entity';
import { LeaveRequest } from './entities/leave-request.entity';
import { LeaveType } from './entities/leave-type.entity';
import { LeaveAuditService } from './services/leave-audit.service';
import { LeaveBalanceCronService } from './services/leave-balance-cron.service';
import { LeaveBalanceLedgerService } from './services/leave-balance-ledger.service';
import { LeaveBalanceService } from './services/leave-balance.service';
import { LeavePdfService } from './services/leave-pdf.service';
import { LeaveWorkflowService } from './services/leave-workflow.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      LeaveType,
      LeavePolicy,
      LeavePolicyType,
      LeaveBalance,
      LeaveBalanceAdjustment,
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
    HrSharedModule,
  ],
  controllers: [LeaveController],
  providers: [
    LeaveService,
    LeaveAuditService,
    LeaveBalanceCronService,
    LeaveBalanceLedgerService,
    LeaveBalanceService,
    LeaveWorkflowService,
    LeavePdfService,
  ],
  exports: [
    LeaveService,
    LeaveBalanceLedgerService,
    LeaveBalanceService,
    TypeOrmModule,
  ],
})
export class LeaveModule {}
