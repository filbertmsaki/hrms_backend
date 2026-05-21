import { PartialType } from '@nestjs/swagger';
import { CreateTimetableRotationDto } from './create-timetable-rotation.dto';

export class UpdateTimetableRotationDto extends PartialType(CreateTimetableRotationDto) {}
