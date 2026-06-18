import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompaniesModule } from '../../companies/companies.module';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { CompanyUserBranchAccess } from '../branches/entities/company-user-branch-access.entity';
import { CompanyUserRole } from '../../companies/entities/company-user-role.entity';
import { Role } from '../../roles/entities/role.entity';
import { ShiftEngineModule } from '../attendance/shift/shift-engine.module';
import { ShiftAssignment } from '../attendance/shift/shift-assignments/entities/shift-assignment.entity';
import { TimetableEngineModule } from '../attendance/timetable/timetable-engine.module';
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Document } from '../documents/entities/document.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeePosition } from '../employees/entities/employee-position.entity';
import { LeaveModule } from '../leave/leave.module';
import { Position } from '../positions/entities/position.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { EmployeeDeviceAssignmentsModule } from '../../access-control/employee-device-assignments/employee-device-assignments.module';
import { EmployeeDeviceAssignment } from '../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { OnboardingApproval } from './entities/onboarding-approval.entity';
import { OnboardingAuditLog } from './entities/onboarding-audit-log.entity';
import { OnboardingRequest } from './entities/onboarding-request.entity';
import { OnboardingTask } from './entities/onboarding-task.entity';
import { OnboardingWorkflowStep } from './entities/onboarding-workflow-step.entity';
import { OnboardingWorkflow } from './entities/onboarding-workflow.entity';
import { OnboardingAuditService } from './services/onboarding-audit.service';
import { OnboardingWorkflowService } from './services/onboarding-workflow.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OnboardingWorkflow,
      OnboardingWorkflowStep,
      OnboardingRequest,
      OnboardingTask,
      OnboardingApproval,
      OnboardingAuditLog,
      Document,
      Employee,
      EmployeePosition,
      Branch,
      Department,
      Position,
      CompanyUser,
      CompanyUserRole,
      CompanyUserBranchAccess,
      Role,
      ShiftAssignment,
      EmployeeTimetable,
      EmployeeDeviceAssignment,
    ]),
    HrSharedModule,
    LeaveModule,
    CompaniesModule,
    ShiftEngineModule,
    TimetableEngineModule,
    EmployeeDeviceAssignmentsModule,
  ],
  controllers: [OnboardingController],
  providers: [
    OnboardingService,
    OnboardingAuditService,
    OnboardingWorkflowService,
  ],
  exports: [OnboardingService, TypeOrmModule],
})
export class OnboardingModule {}
