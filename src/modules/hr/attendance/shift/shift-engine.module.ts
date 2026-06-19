import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../../branches/entities/branch.entity';
import { Department } from '../../departments/entities/department.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { AttendanceHoliday } from '../holidays/entities/holiday.entity';
import { Shift } from './shifts/entities/shift.entity';
import { ShiftBreak } from './shift-breaks/entities/shift-break.entity';
import { ShiftAssignment } from './shift-assignments/entities/shift-assignment.entity';
import { ShiftRotationGroup } from './shift-rotation-groups/entities/shift-rotation-group.entity';
import { ShiftRotationRule } from './shift-rotation-rules/entities/shift-rotation-rule.entity';
import { ShiftSchedule } from './shift-schedules/entities/shift-schedule.entity';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { ShiftsService } from './shifts/shifts.service';
import { ShiftsController } from './shifts/shifts.controller';
import { ShiftBreaksService } from './shift-breaks/shift-breaks.service';
import { ShiftBreaksController } from './shift-breaks/shift-breaks.controller';
import { ShiftAssignmentsService } from './shift-assignments/shift-assignments.service';
import { ShiftAssignmentsController } from './shift-assignments/shift-assignments.controller';
import { ShiftRotationGroupsService } from './shift-rotation-groups/shift-rotation-groups.service';
import { ShiftRotationGroupsController } from './shift-rotation-groups/shift-rotation-groups.controller';
import { ShiftRotationRulesService } from './shift-rotation-rules/shift-rotation-rules.service';
import { ShiftRotationRulesController } from './shift-rotation-rules/shift-rotation-rules.controller';
import { ShiftSchedulesService } from './shift-schedules/shift-schedules.service';
import { ShiftSchedulesController } from './shift-schedules/shift-schedules.controller';
import { AttendanceAssignmentDomainService } from '../shared/attendance-assignment-domain.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Branch,
      Department,
      Employee,
      AttendanceHoliday,
      Shift,
      ShiftBreak,
      ShiftAssignment,
      ShiftRotationGroup,
      ShiftRotationRule,
      ShiftSchedule,
      EmployeeTimetable,
    ]),
  ],
  controllers: [
    ShiftsController,
    ShiftBreaksController,
    ShiftAssignmentsController,
    ShiftRotationGroupsController,
    ShiftRotationRulesController,
    ShiftSchedulesController,
  ],
  providers: [
    ShiftsService,
    ShiftBreaksService,
    ShiftAssignmentsService,
    ShiftRotationGroupsService,
    ShiftRotationRulesService,
    ShiftSchedulesService,
    AttendanceAssignmentDomainService,
  ],
  exports: [
    TypeOrmModule,
    ShiftsService,
    ShiftAssignmentsService,
  ],
})
export class ShiftEngineModule {}
