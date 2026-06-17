import { PartialType } from '@nestjs/swagger';
import { CreateTimetableAttendanceRuleDto } from './create-timetable-attendance-rule.dto';

export class UpdateTimetableAttendanceRuleDto extends PartialType(
  CreateTimetableAttendanceRuleDto,
) {}
