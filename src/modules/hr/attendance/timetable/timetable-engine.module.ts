import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../../branches/entities/branch.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { HolidayGroup } from '../holidays/entities/holiday-group.entity';
import { AttendanceHoliday } from '../holidays/entities/holiday.entity';
import { Shift } from '../shift/shifts/entities/shift.entity';
import { ShiftAssignment } from '../shift/shift-assignments/entities/shift-assignment.entity';
import { Timetable } from './timetables/entities/timetable.entity';
import { TimetableDay } from './timetable-days/entities/timetable-day.entity';
import { EmployeeTimetable } from './employee-timetables/entities/employee-timetable.entity';
import { TimetableRotation } from './timetable-rotations/entities/timetable-rotation.entity';
import { TimetableRotationRule } from './timetable-rotation-rules/entities/timetable-rotation-rule.entity';
import { TimetableHolidayRule } from './timetable-holiday-rules/entities/timetable-holiday-rule.entity';
import { TimetablesController } from './timetables/timetables.controller';
import { TimetablesService } from './timetables/timetables.service';
import { TimetableDaysController } from './timetable-days/timetable-days.controller';
import { TimetableDaysService } from './timetable-days/timetable-days.service';
import { EmployeeTimetablesController } from './employee-timetables/employee-timetables.controller';
import { EmployeeTimetablesService } from './employee-timetables/employee-timetables.service';
import { TimetableRotationsController } from './timetable-rotations/timetable-rotations.controller';
import { TimetableRotationsService } from './timetable-rotations/timetable-rotations.service';
import { TimetableRotationRulesController } from './timetable-rotation-rules/timetable-rotation-rules.controller';
import { TimetableRotationRulesService } from './timetable-rotation-rules/timetable-rotation-rules.service';
import { TimetableHolidayRulesController } from './timetable-holiday-rules/timetable-holiday-rules.controller';
import { TimetableHolidayRulesService } from './timetable-holiday-rules/timetable-holiday-rules.service';
import { AttendanceAssignmentDomainService } from '../shared/attendance-assignment-domain.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Branch,
      Employee,
      HolidayGroup,
      AttendanceHoliday,
      Shift,
      ShiftAssignment,
      Timetable,
      TimetableDay,
      EmployeeTimetable,
      TimetableRotation,
      TimetableRotationRule,
      TimetableHolidayRule,
    ]),
  ],
  controllers: [
    TimetablesController,
    TimetableDaysController,
    EmployeeTimetablesController,
    TimetableRotationsController,
    TimetableRotationRulesController,
    TimetableHolidayRulesController,
  ],
  providers: [
    TimetablesService,
    TimetableDaysService,
    EmployeeTimetablesService,
    TimetableRotationsService,
    TimetableRotationRulesService,
    TimetableHolidayRulesService,
    AttendanceAssignmentDomainService,
  ],
  exports: [
    TypeOrmModule,
    TimetablesService,
    EmployeeTimetablesService,
  ],
})
export class TimetableEngineModule {}
