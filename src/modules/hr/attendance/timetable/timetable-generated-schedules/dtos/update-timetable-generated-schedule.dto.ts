import { PartialType } from '@nestjs/swagger';
import { CreateTimetableGeneratedScheduleDto } from './create-timetable-generated-schedule.dto';

export class UpdateTimetableGeneratedScheduleDto extends PartialType(CreateTimetableGeneratedScheduleDto) {}
