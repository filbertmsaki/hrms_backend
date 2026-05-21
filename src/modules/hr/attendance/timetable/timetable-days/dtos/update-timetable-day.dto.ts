import { PartialType } from '@nestjs/swagger';
import { CreateTimetableDayDto } from './create-timetable-day.dto';

export class UpdateTimetableDayDto extends PartialType(CreateTimetableDayDto) {}
