import { PartialType } from '@nestjs/mapped-types';
import { CreateAttendanceHolidayDto } from './create-attendance-holiday.dto';

export class UpdateAttendanceHolidayDto extends PartialType(CreateAttendanceHolidayDto) {}




