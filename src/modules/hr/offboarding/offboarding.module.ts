import { Module } from '@nestjs/common';
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
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { ShiftAssignment } from '../attendance/shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftSchedule } from '../attendance/shift/shift-schedules/entities/shift-schedule.entity';
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { Position } from '../positions/entities/position.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { OffboardingController } from './offboarding.controller';
import { OffboardingService } from './offboarding.service';
import { OffboardingApproval } from './entities/offboarding-approval.entity';
import { OffboardingAction } from './entities/offboarding-action.entity';
import { OffboardingAssetReturn } from './entities/offboarding-asset-return.entity';
import { OffboardingAuditLog } from './entities/offboarding-audit-log.entity';
import { OffboardingClearance } from './entities/offboarding-clearance.entity';
import { OffboardingExitInterview } from './entities/offboarding-exit-interview.entity';
import { OffboardingRequest } from './entities/offboarding-request.entity';
import { OffboardingSettlementItem } from './entities/offboarding-settlement-item.entity';
import { OffboardingTask } from './entities/offboarding-task.entity';
import { OffboardingWorkflowStep } from './entities/offboarding-workflow-step.entity';
import { OffboardingWorkflow } from './entities/offboarding-workflow.entity';
import { OffboardingAuditService } from './services/offboarding-audit.service';
import { OffboardingCronService } from './services/offboarding-cron.service';
import { OffboardingWorkflowService } from './services/offboarding-workflow.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OffboardingWorkflow,
      OffboardingWorkflowStep,
      OffboardingRequest,
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
  ],
  controllers: [OffboardingController],
  providers: [
    OffboardingService,
    OffboardingAuditService,
    OffboardingWorkflowService,
    OffboardingCronService,
  ],
  exports: [OffboardingService, TypeOrmModule],
})
export class OffboardingModule {}
