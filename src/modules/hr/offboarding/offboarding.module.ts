import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from '../../files/files.module';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { CompanyUserRole } from '../../companies/entities/company-user-role.entity';
import { Role } from '../../roles/entities/role.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Document } from '../documents/entities/document.entity';
import { Department } from '../departments/entities/department.entity';
import { EmployeePosition } from '../employees/entities/employee-position.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeAsset } from '../employees/entities/employee-asset.entity';
import { EmployeeCompensationVersion } from '../employee-movements/entities/employee-compensation-version.entity';
import { EmployeePayrollProfile } from '../payroll/entities/employee-payroll-profile.entity';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { ShiftAssignment } from '../attendance/shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftSchedule } from '../attendance/shift/shift-schedules/entities/shift-schedule.entity';
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { Position } from '../positions/entities/position.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { EmployeesModule } from '../employees/employees.module';
import { LeaveModule } from '../leave/leave.module';
import { PayrollModule } from '../payroll/payroll.module';
import { AccessGroupsModule } from '../../access-control/access-groups/access-groups.module';
import { PostgresAdvisoryLockService } from '../../../common/database/postgres-advisory-lock.service';
import { PayrollProrationService } from '../payroll/services/payroll-core.services';
import { OffboardingController } from './offboarding.controller';
import { OffboardingService } from './offboarding.service';
import { OffboardingApproval } from './entities/offboarding-approval.entity';
import { OffboardingAction } from './entities/offboarding-action.entity';
import { OffboardingAccessOperation } from './entities/offboarding-access-operation.entity';
import { OffboardingAssetReturn } from './entities/offboarding-asset-return.entity';
import { OffboardingAuditLog } from './entities/offboarding-audit-log.entity';
import { OffboardingClearance } from './entities/offboarding-clearance.entity';
import { OffboardingExitInterview } from './entities/offboarding-exit-interview.entity';
import { OffboardingNoticePolicy } from './entities/offboarding-notice-policy.entity';
import { OffboardingNumberSequence } from './entities/offboarding-number-sequence.entity';
import { OffboardingRequest } from './entities/offboarding-request.entity';
import { OffboardingSettlementItem } from './entities/offboarding-settlement-item.entity';
import { OffboardingTask } from './entities/offboarding-task.entity';
import { OffboardingWorkflowStep } from './entities/offboarding-workflow-step.entity';
import { OffboardingWorkflow } from './entities/offboarding-workflow.entity';
import { OffboardingAuditService } from './services/offboarding-audit.service';
import { OffboardingCronService } from './services/offboarding-cron.service';
import { OffboardingNoticeService } from './services/offboarding-notice.service';
import { OffboardingWorkflowService } from './services/offboarding-workflow.service';
import { OffboardingAccessOperationExecutorService } from './services/offboarding-access-operation-executor.service';
import { OffboardingLetterService } from './services/offboarding-letter.service';
import { OffboardingAccessTerminationService } from './services/offboarding-access-termination.service';
import { OffboardingAccessTerminationDispatcherService } from './services/offboarding-access-termination-dispatcher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OffboardingWorkflow,
      OffboardingWorkflowStep,
      OffboardingRequest,
      OffboardingAccessOperation,
      OffboardingNoticePolicy,
      OffboardingNumberSequence,
      OffboardingTask,
      OffboardingAction,
      OffboardingAssetReturn,
      OffboardingSettlementItem,
      OffboardingApproval,
      OffboardingClearance,
      OffboardingExitInterview,
      OffboardingAuditLog,
      Document,
      Employee,
      EmployeeAsset,
      EmployeeCompensationVersion,
      EmployeePayrollProfile,
      EmployeePosition,
      ShiftAssignment,
      ShiftSchedule,
      EmployeeTimetable,
      AttendanceDailySummary,
      Branch,
      Department,
      Position,
      CompanyUser,
      CompanyUserRole,
      Role,
    ]),
    FilesModule,
    HrSharedModule,
    forwardRef(() => EmployeesModule),
    LeaveModule,
    PayrollModule,
    AccessGroupsModule,
  ],
  controllers: [OffboardingController],
  providers: [
    OffboardingService,
    PayrollProrationService,
    OffboardingAuditService,
    OffboardingNoticeService,
    OffboardingWorkflowService,
    OffboardingCronService,
    OffboardingAccessOperationExecutorService,
    OffboardingLetterService,
    OffboardingAccessTerminationService,
    OffboardingAccessTerminationDispatcherService,
    PostgresAdvisoryLockService,
  ],
  exports: [OffboardingService, TypeOrmModule],
})
export class OffboardingModule {}
