import { PartialType } from '@nestjs/mapped-types';
import { CreateAttendanceBusinessTripDto } from './create-attendance-business-trip.dto';

export class UpdateAttendanceBusinessTripDto extends PartialType(
  CreateAttendanceBusinessTripDto,
) {}
