import { Module } from '@nestjs/common';
import { AttendanceModule } from './attendance/attendance.module';
import { BranchesModule } from './branches/branches.module';
import { CostCentersModule } from './cost-centers/cost-centers.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmployeePositionsModule } from './employee-positions/employee-positions.module';
import { EmployeesModule } from './employees/employees.module';
import { EmployeeGradesModule } from './grades/employee-grades.module';
import { LeaveModule } from './leave/leave.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { OffboardingModule } from './offboarding/offboarding.module';
import { PositionsModule } from './positions/positions.module';
import { EmployeeSelfServiceModule } from './self-service/employee-self-service.module';
import { TimetableEngineModule } from './attendance/timetable/timetable-engine.module';
import { ShiftEngineModule } from './attendance/shift/shift-engine.module';
import { HrLaunchReadinessModule } from './launch-readiness/hr-launch-readiness.module';
import { HrNotificationModule } from './notifications/hr-notification.module';
import { DefaultAvatarsModule } from './default-avatars/default-avatars.module';
import { ActionInboxModule } from './action-inbox/action-inbox.module';
import { HrDocumentsModule } from './documents/hr-documents.module';
import { ManagerSelfServiceModule } from './manager-self-service/manager-self-service.module';
import { DashboardsModule } from './dashboards/dashboards.module';

@Module({
  imports: [
    AttendanceModule,
    ShiftEngineModule,
    TimetableEngineModule,
    BranchesModule,
    CostCentersModule,
    DepartmentsModule,
    EmployeeGradesModule,
    PositionsModule,
    DefaultAvatarsModule,
    EmployeesModule,
    EmployeePositionsModule,
    LeaveModule,
    ActionInboxModule,
    HrDocumentsModule,
    EmployeeSelfServiceModule,
    ManagerSelfServiceModule,
    DashboardsModule,
    OnboardingModule,
    OffboardingModule,
    HrLaunchReadinessModule,
    HrNotificationModule,
  ],
})
export class HrModule {}
