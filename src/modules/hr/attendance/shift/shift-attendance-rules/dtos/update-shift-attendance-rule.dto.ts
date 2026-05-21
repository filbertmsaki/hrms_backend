import { PartialType } from '@nestjs/swagger';
import { CreateShiftAttendanceRuleDto } from './create-shift-attendance-rule.dto';

export class UpdateShiftAttendanceRuleDto extends PartialType(CreateShiftAttendanceRuleDto) {}
