import { PartialType } from '@nestjs/swagger';
import { CreateShiftChangeRequestDto } from './create-shift-change-request.dto';

export class UpdateShiftChangeRequestDto extends PartialType(
  CreateShiftChangeRequestDto,
) {}
