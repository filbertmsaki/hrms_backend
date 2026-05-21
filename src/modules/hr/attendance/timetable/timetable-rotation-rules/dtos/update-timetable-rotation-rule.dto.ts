import { PartialType } from '@nestjs/swagger';
import { CreateTimetableRotationRuleDto } from './create-timetable-rotation-rule.dto';

export class UpdateTimetableRotationRuleDto extends PartialType(CreateTimetableRotationRuleDto) {}
