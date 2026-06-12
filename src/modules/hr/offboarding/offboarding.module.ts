import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { Position } from '../positions/entities/position.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { OffboardingController } from './offboarding.controller';
import { OffboardingService } from './offboarding.service';
import { OffboardingApproval } from './entities/offboarding-approval.entity';
import { OffboardingAuditLog } from './entities/offboarding-audit-log.entity';
import { OffboardingClearance } from './entities/offboarding-clearance.entity';
import { OffboardingRequest } from './entities/offboarding-request.entity';
import { OffboardingTask } from './entities/offboarding-task.entity';
import { OffboardingWorkflowStep } from './entities/offboarding-workflow-step.entity';
import { OffboardingWorkflow } from './entities/offboarding-workflow.entity';
import { OffboardingAuditService } from './services/offboarding-audit.service';
import { OffboardingWorkflowService } from './services/offboarding-workflow.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OffboardingWorkflow,
      OffboardingWorkflowStep,
      OffboardingRequest,
      OffboardingTask,
      OffboardingApproval,
      OffboardingClearance,
      OffboardingAuditLog,
      Document,
      Employee,
      EmployeePosition,
      ShiftAssignment,
      EmployeeTimetable,
      AttendanceDailySummary,
      Branch,
      Department,
      Position,
      CompanyUser,
      CompanyUserRole,
      Role,
    ]),
    HrSharedModule,
  ],
  controllers: [OffboardingController],
  providers: [OffboardingService, OffboardingAuditService, OffboardingWorkflowService],
  exports: [OffboardingService, TypeOrmModule],
})
export class OffboardingModule {}
