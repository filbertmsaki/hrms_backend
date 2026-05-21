import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { Employee } from '../employees/entities/employee.entity';
import { HolidayGroup } from '../attendance/holidays/entities/holiday-group.entity';
import { AttendanceHoliday } from '../attendance/holidays/entities/holiday.entity';
import { Timetable } from './timetables/entities/timetable.entity';
import { TimetableDay } from './timetable-days/entities/timetable-day.entity';
import { TimetableShiftRule } from './timetable-shift-rules/entities/timetable-shift-rule.entity';
import { EmployeeTimetable } from './employee-timetables/entities/employee-timetable.entity';
import { TimetableRotation } from './timetable-rotations/entities/timetable-rotation.entity';
import { TimetableRotationRule } from './timetable-rotation-rules/entities/timetable-rotation-rule.entity';
import { TimetableHolidayRule } from './timetable-holiday-rules/entities/timetable-holiday-rule.entity';
import { TimetableAttendanceRule } from './timetable-attendance-rules/entities/timetable-attendance-rule.entity';
import { TimetableGeneratedSchedule } from './timetable-generated-schedules/entities/timetable-generated-schedule.entity';
import { TimetablesController } from './timetables/timetables.controller';
import { TimetablesService } from './timetables/timetables.service';
import { TimetableDaysController } from './timetable-days/timetable-days.controller';
import { TimetableDaysService } from './timetable-days/timetable-days.service';
import { TimetableShiftRulesController } from './timetable-shift-rules/timetable-shift-rules.controller';
import { TimetableShiftRulesService } from './timetable-shift-rules/timetable-shift-rules.service';
import { EmployeeTimetablesController } from './employee-timetables/employee-timetables.controller';
import { EmployeeTimetablesService } from './employee-timetables/employee-timetables.service';
import { TimetableRotationsController } from './timetable-rotations/timetable-rotations.controller';
import { TimetableRotationsService } from './timetable-rotations/timetable-rotations.service';
import { TimetableRotationRulesController } from './timetable-rotation-rules/timetable-rotation-rules.controller';
import { TimetableRotationRulesService } from './timetable-rotation-rules/timetable-rotation-rules.service';
import { TimetableHolidayRulesController } from './timetable-holiday-rules/timetable-holiday-rules.controller';
import { TimetableHolidayRulesService } from './timetable-holiday-rules/timetable-holiday-rules.service';
import { TimetableAttendanceRulesController } from './timetable-attendance-rules/timetable-attendance-rules.controller';
import { TimetableAttendanceRulesService } from './timetable-attendance-rules/timetable-attendance-rules.service';
import { TimetableGeneratedSchedulesController } from './timetable-generated-schedules/timetable-generated-schedules.controller';
import { TimetableGeneratedSchedulesService } from './timetable-generated-schedules/timetable-generated-schedules.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Branch,
      Employee,
      HolidayGroup,
      AttendanceHoliday,
      Timetable,
      TimetableDay,
      TimetableShiftRule,
      EmployeeTimetable,
      TimetableRotation,
      TimetableRotationRule,
      TimetableHolidayRule,
      TimetableAttendanceRule,
      TimetableGeneratedSchedule,
    ]),
  ],
  controllers: [
    TimetablesController,
    TimetableDaysController,
    TimetableShiftRulesController,
    EmployeeTimetablesController,
    TimetableRotationsController,
    TimetableRotationRulesController,
    TimetableHolidayRulesController,
    TimetableAttendanceRulesController,
    TimetableGeneratedSchedulesController,
  ],
  providers: [
    TimetablesService,
    TimetableDaysService,
    TimetableShiftRulesService,
    EmployeeTimetablesService,
    TimetableRotationsService,
    TimetableRotationRulesService,
    TimetableHolidayRulesService,
    TimetableAttendanceRulesService,
    TimetableGeneratedSchedulesService,
  ],
  exports: [TypeOrmModule, TimetablesService],
})
export class TimetableEngineModule {}
