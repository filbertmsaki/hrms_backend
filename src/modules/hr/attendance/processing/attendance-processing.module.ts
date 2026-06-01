import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceHoliday } from '../holidays/entities/holiday.entity';
import { AttendanceDevice } from '../devices/entities/attendance-device.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveRequest } from '../../leave/entities/leave-request.entity';
import { ShiftAssignment } from '../shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftAttendanceRule } from '../shift/shift-attendance-rules/entities/shift-attendance-rule.entity';
import { ShiftOvertimeRule } from '../shift/shift-overtime-rules/entities/shift-overtime-rule.entity';
import { ShiftRotationGroup } from '../shift/shift-rotation-groups/entities/shift-rotation-group.entity';
import { ShiftRotationRule } from '../shift/shift-rotation-rules/entities/shift-rotation-rule.entity';
import { ShiftSchedule } from '../shift/shift-schedules/entities/shift-schedule.entity';
import { Shift } from '../shift/shifts/entities/shift.entity';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { TimetableAttendanceRule } from '../timetable/timetable-attendance-rules/entities/timetable-attendance-rule.entity';
import { TimetableDay } from '../timetable/timetable-days/entities/timetable-day.entity';
import { TimetableGeneratedSchedule } from '../timetable/timetable-generated-schedules/entities/timetable-generated-schedule.entity';
import { TimetableShiftRule } from '../timetable/timetable-shift-rules/entities/timetable-shift-rule.entity';
import { Timetable } from '../timetable/timetables/entities/timetable.entity';
import { AttendanceBusinessTrip } from './entities/attendance-business-trip.entity';
import { AttendanceDailySummary } from './entities/attendance-daily-summary.entity';
import { AttendanceProcessedEvent } from './entities/attendance-processed-event.entity';
import { AttendanceRecalculationJob } from './entities/attendance-recalculation-job.entity';
import { EmployeeDeviceIdentity } from './entities/employee-device-identity.entity';
import { AttendanceProcessingController } from './attendance-processing.controller';
import { AttendanceEmployeeResolverService } from './attendance-employee-resolver.service';
import { AttendanceScheduleResolverService } from './attendance-schedule-resolver.service';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import { AttendanceProcessingService } from './attendance-processing.service';
import { AttendanceRecalculationService } from './attendance-recalculation.service';
import { AttendanceProcessingCronService } from './attendance-processing-cron.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyUser,
      Employee,
      AttendanceDevice,
      AttendanceHoliday,
      LeaveRequest,
      HikvisionAttendanceLog,
      Shift,
      ShiftAssignment,
      ShiftSchedule,
      ShiftAttendanceRule,
      ShiftOvertimeRule,
      ShiftRotationGroup,
      ShiftRotationRule,
      Timetable,
      EmployeeTimetable,
      TimetableDay,
      TimetableShiftRule,
      TimetableAttendanceRule,
      TimetableGeneratedSchedule,
      EmployeeDeviceIdentity,
      AttendanceProcessedEvent,
      AttendanceDailySummary,
      AttendanceRecalculationJob,
      AttendanceBusinessTrip,
    ]),
  ],
  controllers: [AttendanceProcessingController],
  providers: [
    AttendanceEmployeeResolverService,
    AttendanceScheduleResolverService,
    AttendanceDailySummaryService,
    AttendanceProcessingService,
    AttendanceRecalculationService,
    AttendanceProcessingCronService,
  ],
  exports: [
    AttendanceProcessingService,
    AttendanceDailySummaryService,
    AttendanceRecalculationService,
    TypeOrmModule,
  ],
})
export class AttendanceProcessingModule {}
