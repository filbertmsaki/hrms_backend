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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      AttendanceDailySummary,
      LeaveRequest,
      Document,
      OnboardingRequest,
      OffboardingRequest,
    ]),
    HrSharedModule,
    EmployeeSelfServiceModule,
    ManagerSelfServiceModule,
    PerformanceModule,
    WorkActivitiesModule,
  ],
  controllers: [DashboardsController],
  providers: [
    DashboardDateService,
    EmployeeDashboardService,
    ManagerDashboardService,
    HrDashboardService,
    ManagementDashboardService,
  ],
})
export class DashboardsModule {}
