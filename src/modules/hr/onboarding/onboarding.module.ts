import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompaniesModule } from '../../companies/companies.module';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { CompanyUserBranchAccess } from '../branches/entities/company-user-branch-access.entity';
import { CompanyUserRole } from '../../companies/entities/company-user-role.entity';
import { Role } from '../../roles/entities/role.entity';
import { ShiftEngineModule } from '../attendance/shift/shift-engine.module';
import { ShiftSchedule } from '../attendance/shift/shift-schedules/entities/shift-schedule.entity';
import { TimetableEngineModule } from '../attendance/timetable/timetable-engine.module';
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Document } from '../documents/entities/document.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { FilesModule } from '../../files/files.module';
import { LeaveModule } from '../leave/leave.module';
import { HrSharedModule } from '../shared/hr-shared.module';
import { EmployeeDeviceAssignmentsModule } from '../../access-control/employee-device-assignments/employee-device-assignments.module';
import { EmployeeDeviceAssignment } from '../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { OnboardingApproval } from './entities/onboarding-approval.entity';
import { OnboardingAuditLog } from './entities/onboarding-audit-log.entity';
import { OnboardingNumberSequence } from './entities/onboarding-number-sequence.entity';
import { OnboardingProvisioningOperation } from './entities/onboarding-provisioning-operation.entity';
import { OnboardingRequest } from './entities/onboarding-request.entity';
import { OnboardingTask } from './entities/onboarding-task.entity';
import { OnboardingWorkflowStep } from './entities/onboarding-workflow-step.entity';
import { OnboardingWorkflow } from './entities/onboarding-workflow.entity';
import { OnboardingAuditService } from './services/onboarding-audit.service';
import { OnboardingCronService } from './services/onboarding-cron.service';
import { OnboardingWorkflowService } from './services/onboarding-workflow.service';
import { ProbationModule } from '../probation/probation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OnboardingWorkflow,
      OnboardingWorkflowStep,
      OnboardingRequest,
      OnboardingTask,
      OnboardingApproval,
      OnboardingAuditLog,
      OnboardingNumberSequence,
      OnboardingProvisioningOperation,
      Document,
      Employee,
      Branch,
      Department,
      CompanyUser,
      CompanyUserRole,
      CompanyUserBranchAccess,
      Role,
      ShiftSchedule,
      EmployeeTimetable,
      EmployeeDeviceAssignment,
    ]),
    FilesModule,
    HrSharedModule,
    LeaveModule,
    CompaniesModule,
    ShiftEngineModule,
    TimetableEngineModule,
    EmployeeDeviceAssignmentsModule,
    ProbationModule,
  ],
  controllers: [OnboardingController],
  providers: [
    OnboardingService,
    OnboardingAuditService,
    OnboardingWorkflowService,
    OnboardingCronService,
  ],
  exports: [OnboardingService, TypeOrmModule],
})
export class OnboardingModule {}
