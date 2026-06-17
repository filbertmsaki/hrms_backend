import { PartialType } from '@nestjs/swagger';
import { CreateShiftScheduleDto } from './create-shift-schedule.dto';

export class UpdateShiftScheduleDto extends PartialType(
  CreateShiftScheduleDto,
) {}
