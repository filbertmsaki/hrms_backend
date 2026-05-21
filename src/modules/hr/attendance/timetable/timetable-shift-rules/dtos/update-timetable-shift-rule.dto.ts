import { PartialType } from '@nestjs/swagger';
import { CreateTimetableShiftRuleDto } from './create-timetable-shift-rule.dto';

export class UpdateTimetableShiftRuleDto extends PartialType(CreateTimetableShiftRuleDto) {}
