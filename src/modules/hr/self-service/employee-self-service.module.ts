import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from '../../files/files.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { UsersModule } from '../../users/users.module';
import { AttendanceMobilePunch } from '../attendance/mobile-punches/entities/attendance-mobile-punch.entity';
import { AttendanceModule } from '../attendance/attendance.module';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceProcessingModule } from '../attendance/processing/attendance-processing.module';
import { ShiftAssignment } from '../attendance/shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftSchedule } from '../attendance/shift/shift-schedules/entities/shift-schedule.entity';
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeesModule } from '../employees/employees.module';
import { LeaveModule } from '../leave/leave.module';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { Shift } from '../attendance/shift/shifts/entities/shift.entity';
import { Timetable } from '../attendance/timetable/timetables/entities/timetable.entity';
import { Employee } from '../employees/entities/employee.entity';
import { AttendanceCorrectionRequest } from './entities/attendance-correction-request.entity';
import { EmployeeProfileUpdateRequest } from './entities/employee-profile-update-request.entity';
import { EmployeeSelfServiceController } from './employee-self-service.controller';
import { EmployeeSelfServiceService } from './employee-self-service.service';
import { EmployeeSelfServiceApprovalController } from './employee-self-service-approval.controller';
import { EmployeeSelfServiceApprovalService } from './employee-self-service-approval.service';
import { DefaultAvatarsModule } from '../default-avatars/default-avatars.module';
import { EmployeeContact } from '../employees/entities/employee-contact.entity';
import { EmployeeAddress } from '../employees/entities/employee-address.entity';
import { EmployeeRelative } from '../employees/entities/employee-relative.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { ProfileChangeRequest } from './entities/profile-change-request.entity';
import { ProfileChangeRequestItem } from './entities/profile-change-request-item.entity';
import { ProfileChangeRequestFile } from './entities/profile-change-request-file.entity';
import { ProfileChangeRequestAudit } from './entities/profile-change-request-audit.entity';
import { ProfileChangeFieldPolicyService } from './profile-change-field-policy.service';
import { ProfileChangeRequestsService } from './profile-change-requests.service';
import { MeProfileChangeRequestsController } from './me-profile-change-requests.controller';
import { HrProfileChangeRequestsController } from './hr-profile-change-requests.controller';
import { User } from '../../users/entities/user.entity';
import { OnboardingRequest } from '../onboarding/entities/onboarding-request.entity';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { ActionInboxModule } from '../action-inbox/action-inbox.module';
import { HrDocumentsModule } from '../documents/hr-documents.module';
import { OffboardingModule } from '../offboarding/offboarding.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceDailySummary,
      AttendanceMobilePunch,
      LeaveRequest,
      ShiftSchedule,
      ShiftAssignment,
      Shift,
      EmployeeTimetable,
      Timetable,
      AttendanceCorrectionRequest,
      EmployeeProfileUpdateRequest,
      Employee,
      User,
      EmployeeContact,
      EmployeeAddress,
      EmployeeRelative,
      Branch,
      Department,
      ProfileChangeRequest,
      ProfileChangeRequestItem,
      ProfileChangeRequestFile,
      ProfileChangeRequestAudit,
      OnboardingRequest,
      OffboardingRequest,
    ]),
    FilesModule,
    NotificationsModule,
    UsersModule,
    EmployeesModule,
    DefaultAvatarsModule,
    HrSharedModule,
    LeaveModule,
    AttendanceModule,
    AttendanceProcessingModule,
    ActionInboxModule,
    HrDocumentsModule,
    OffboardingModule,
  ],
  controllers: [
    EmployeeSelfServiceController,
    EmployeeSelfServiceApprovalController,
    MeProfileChangeRequestsController,
    HrProfileChangeRequestsController,
  ],
  providers: [
    EmployeeSelfServiceService,
    EmployeeSelfServiceApprovalService,
    ProfileChangeFieldPolicyService,
    ProfileChangeRequestsService,
  ],
  exports: [
    EmployeeSelfServiceService,
    EmployeeSelfServiceApprovalService,
    ProfileChangeRequestsService,
  ],
})
export class EmployeeSelfServiceModule {}
