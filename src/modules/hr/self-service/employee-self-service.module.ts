import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { EmployeeSelfServiceController } from './employee-self-service.controller';
import { EmployeeSelfServiceService } from './employee-self-service.service';
import { Shift } from '../attendance/shift/shifts/entities/shift.entity';
import { Timetable } from '../attendance/timetable/timetables/entities/timetable.entity';

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
    ]),
    UsersModule,
    EmployeesModule,
    LeaveModule,
    AttendanceModule,
    AttendanceProcessingModule,
  ],
  controllers: [EmployeeSelfServiceController],
  providers: [EmployeeSelfServiceService],
})
export class EmployeeSelfServiceModule {}
