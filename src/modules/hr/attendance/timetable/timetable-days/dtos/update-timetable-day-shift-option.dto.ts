import { PartialType } from '@nestjs/swagger';
import { CreateTimetableDayShiftOptionDto } from './create-timetable-day-shift-option.dto';
export class UpdateTimetableDayShiftOptionDto extends PartialType(
  CreateTimetableDayShiftOptionDto,
) {}
