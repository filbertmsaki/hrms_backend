import { PartialType } from '@nestjs/swagger';
import { CreateShiftRotationGroupDto } from './create-shift-rotation-group.dto';

export class UpdateShiftRotationGroupDto extends PartialType(
  CreateShiftRotationGroupDto,
) {}
