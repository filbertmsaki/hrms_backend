import { FormsFeedbackModule } from './forms-feedback/forms-feedback.module';
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
import { ProbationModule } from './probation/probation.module';
import { EmployeeMovementsModule } from './employee-movements/employee-movements.module';
import { WorkActivitiesModule } from './work-activities/work-activities.module';
import { PayrollModule } from './payroll/payroll.module';
import { EmployeeFinanceModule } from './employee-finance/employee-finance.module';
import { EmployeeInvitationsModule } from './employee-invitations/employee-invitations.module';
import { EmploymentHistoryModule } from './employment-history/employment-history.module';
import { EmployeeStatusChangeModule } from './employee-status-change/employee-status-change.module';
import { EmploymentContractsModule } from './contracts/employment-contracts.module';
import { EmploymentLettersModule } from './contracts/employment-letters.module';
import { RecruitmentModule } from './recruitment/recruitment.module';
import { ManagerRecommendationsModule } from './manager-recommendations/manager-recommendations.module';
import { KpiModule } from './kpi/kpi.module';

@Module({
  imports: [
    FormsFeedbackModule,
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
    EmploymentHistoryModule,
    EmploymentContractsModule,
    EmploymentLettersModule,
    RecruitmentModule,
    ManagerRecommendationsModule,
    EmployeePositionsModule,
    LeaveModule,
    ActionInboxModule,
    HrDocumentsModule,
    EmployeeSelfServiceModule,
    ManagerSelfServiceModule,
    DashboardsModule,
    ProbationModule,
    WorkActivitiesModule,
    PayrollModule,
    EmployeeFinanceModule,
    EmployeeInvitationsModule,
    EmployeeMovementsModule,
    OnboardingModule,
    OffboardingModule,
    HrLaunchReadinessModule,
    HrNotificationModule,
    EmployeeStatusChangeModule,
    KpiModule,
  ],
})
export class HrModule {}
