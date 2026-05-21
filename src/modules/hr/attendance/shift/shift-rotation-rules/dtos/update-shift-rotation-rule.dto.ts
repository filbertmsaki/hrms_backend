import { PartialType } from '@nestjs/swagger';
import { CreateShiftRotationRuleDto } from './create-shift-rotation-rule.dto';

export class UpdateShiftRotationRuleDto extends PartialType(CreateShiftRotationRuleDto) {}
