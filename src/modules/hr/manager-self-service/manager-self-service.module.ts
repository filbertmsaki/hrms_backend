import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HrSharedModule } from '../shared/hr-shared.module';
import { ActionInboxModule } from '../action-inbox/action-inbox.module';
import { Employee } from '../employees/entities/employee.entity';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceCorrectionRequest } from '../self-service/entities/attendance-correction-request.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { ProbationCase } from '../probation/entities/probation-case.entity';
import { ManagerSelfServiceController } from './manager-self-service.controller';
import { ManagerSelfServiceService } from './manager-self-service.service';
import { PerformanceModule } from '../performance/performance.module';
import { WorkActivitiesModule } from '../work-activities/work-activities.module';
import {
  DailyActivityEntry,
  DailyActivityReport,
} from '../work-activities/entities/daily-activity.entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      AttendanceDailySummary,
      AttendanceCorrectionRequest,
      LeaveRequest,
      ProbationCase,
      DailyActivityReport,
      DailyActivityEntry,
    ]),
    HrSharedModule,
    ActionInboxModule,
    PerformanceModule,
    WorkActivitiesModule,
  ],
  controllers: [ManagerSelfServiceController],
  providers: [ManagerSelfServiceService],
  exports: [ManagerSelfServiceService],
})
export class ManagerSelfServiceModule {}
