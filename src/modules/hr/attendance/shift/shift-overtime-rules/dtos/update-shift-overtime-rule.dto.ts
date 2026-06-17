import { PartialType } from '@nestjs/swagger';
import { CreateShiftOvertimeRuleDto } from './create-shift-overtime-rule.dto';

export class UpdateShiftOvertimeRuleDto extends PartialType(
  CreateShiftOvertimeRuleDto,
) {}
