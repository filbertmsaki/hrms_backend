import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HrSharedModule } from '../shared/hr-shared.module';
import { ActionInboxModule } from '../action-inbox/action-inbox.module';
import { Employee } from '../employees/entities/employee.entity';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceCorrectionRequest } from '../self-service/entities/attendance-correction-request.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { ManagerSelfServiceController } from './manager-self-service.controller';
import { ManagerSelfServiceService } from './manager-self-service.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      AttendanceDailySummary,
      AttendanceCorrectionRequest,
      LeaveRequest,
    ]),
    HrSharedModule,
    ActionInboxModule,
  ],
  controllers: [ManagerSelfServiceController],
  providers: [ManagerSelfServiceService],
  exports: [ManagerSelfServiceService],
})
export class ManagerSelfServiceModule {}
