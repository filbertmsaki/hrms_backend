import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HrSharedModule } from '../shared/hr-shared.module';
import { Employee } from '../employees/entities/employee.entity';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { Document } from '../documents/entities/document.entity';
import { OnboardingRequest } from '../onboarding/entities/onboarding-request.entity';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { EmployeeSelfServiceModule } from '../self-service/employee-self-service.module';
import { ManagerSelfServiceModule } from '../manager-self-service/manager-self-service.module';
import { PerformanceModule } from '../performance/performance.module';
import { DashboardsController } from './dashboards.controller';
import { DashboardDateService } from './dashboard-date.service';
import { EmployeeDashboardService } from './employee-dashboard.service';
import { ManagerDashboardService } from './manager-dashboard.service';
import { HrDashboardService } from './hr-dashboard.service';
import { ManagementDashboardService } from './management-dashboard.service';
import { WorkActivitiesModule } from '../work-activities/work-activities.module';
import { PayrollModule } from '../payroll/payroll.module';
import { EmployeeFinanceModule } from '../employee-finance/employee-finance.module';
import { ProbationModule } from '../probation/probation.module';
import { ActionInboxModule } from '../action-inbox/action-inbox.module';
import { Company } from '../../companies/entities/company.entity';
import { PerformanceReview } from '../performance/entities/performance-review.entity';
import { PublishedScoreDrilldownService } from './published-score-drilldown.service';
import { EmployeeDocumentRequirement } from './entities/employee-document-requirement.entity';
import { DashboardLeaveService } from './dashboard-leave.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      Employee,
      AttendanceDailySummary,
      LeaveRequest,
      Document,
      OnboardingRequest,
      OffboardingRequest,
      PerformanceReview,
      EmployeeDocumentRequirement,
    ]),
    HrSharedModule,
    EmployeeSelfServiceModule,
    ManagerSelfServiceModule,
    PerformanceModule,
    WorkActivitiesModule,
    PayrollModule,
    EmployeeFinanceModule,
    ProbationModule,
    ActionInboxModule,
  ],
  controllers: [DashboardsController],
  providers: [
    DashboardDateService,
    EmployeeDashboardService,
    ManagerDashboardService,
    HrDashboardService,
    ManagementDashboardService,
    PublishedScoreDrilldownService,
    DashboardLeaveService,
  ],
})
export class DashboardsModule {}
