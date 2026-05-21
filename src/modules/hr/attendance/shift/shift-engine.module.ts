import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../../branches/entities/branch.entity';
import { Department } from '../../departments/entities/department.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { AttendanceHoliday } from '../holidays/entities/holiday.entity';
import { Shift } from './shifts/entities/shift.entity';
import { ShiftBreak } from './shift-breaks/entities/shift-break.entity';
import { ShiftOvertimeRule } from './shift-overtime-rules/entities/shift-overtime-rule.entity';
import { ShiftAttendanceRule } from './shift-attendance-rules/entities/shift-attendance-rule.entity';
import { ShiftAssignment } from './shift-assignments/entities/shift-assignment.entity';
import { ShiftRotationGroup } from './shift-rotation-groups/entities/shift-rotation-group.entity';
import { ShiftRotationRule } from './shift-rotation-rules/entities/shift-rotation-rule.entity';
import { ShiftSchedule } from './shift-schedules/entities/shift-schedule.entity';
import { ShiftChangeRequest } from './shift-change-requests/entities/shift-change-request.entity';
import { ShiftTemplate } from './shift-templates/entities/shift-template.entity';
import { ShiftsService } from './shifts/shifts.service';
import { ShiftsController } from './shifts/shifts.controller';
import { ShiftBreaksService } from './shift-breaks/shift-breaks.service';
import { ShiftBreaksController } from './shift-breaks/shift-breaks.controller';
import { ShiftOvertimeRulesService } from './shift-overtime-rules/shift-overtime-rules.service';
import { ShiftOvertimeRulesController } from './shift-overtime-rules/shift-overtime-rules.controller';
import { ShiftAttendanceRulesService } from './shift-attendance-rules/shift-attendance-rules.service';
import { ShiftAttendanceRulesController } from './shift-attendance-rules/shift-attendance-rules.controller';
import { ShiftAssignmentsService } from './shift-assignments/shift-assignments.service';
import { ShiftAssignmentsController } from './shift-assignments/shift-assignments.controller';
import { ShiftRotationGroupsService } from './shift-rotation-groups/shift-rotation-groups.service';
import { ShiftRotationGroupsController } from './shift-rotation-groups/shift-rotation-groups.controller';
import { ShiftRotationRulesService } from './shift-rotation-rules/shift-rotation-rules.service';
import { ShiftRotationRulesController } from './shift-rotation-rules/shift-rotation-rules.controller';
import { ShiftSchedulesService } from './shift-schedules/shift-schedules.service';
import { ShiftSchedulesController } from './shift-schedules/shift-schedules.controller';
import { ShiftChangeRequestsService } from './shift-change-requests/shift-change-requests.service';
import { ShiftChangeRequestsController } from './shift-change-requests/shift-change-requests.controller';
import { ShiftTemplatesService } from './shift-templates/shift-templates.service';
import { ShiftTemplatesController } from './shift-templates/shift-templates.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Branch,
      Department,
      Employee,
      AttendanceHoliday,
      Shift,
      ShiftBreak,
      ShiftOvertimeRule,
      ShiftAttendanceRule,
      ShiftAssignment,
      ShiftRotationGroup,
      ShiftRotationRule,
      ShiftSchedule,
      ShiftChangeRequest,
      ShiftTemplate,
    ]),
  ],
  controllers: [
    ShiftsController,
    ShiftBreaksController,
    ShiftOvertimeRulesController,
    ShiftAttendanceRulesController,
    ShiftAssignmentsController,
    ShiftRotationGroupsController,
    ShiftRotationRulesController,
    ShiftSchedulesController,
    ShiftChangeRequestsController,
    ShiftTemplatesController,
  ],
  providers: [
    ShiftsService,
    ShiftBreaksService,
    ShiftOvertimeRulesService,
    ShiftAttendanceRulesService,
    ShiftAssignmentsService,
    ShiftRotationGroupsService,
    ShiftRotationRulesService,
    ShiftSchedulesService,
    ShiftChangeRequestsService,
    ShiftTemplatesService,
  ],
  exports: [TypeOrmModule, ShiftsService],
})
export class ShiftEngineModule {}
