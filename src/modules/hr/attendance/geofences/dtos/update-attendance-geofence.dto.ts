import { PartialType } from '@nestjs/mapped-types';
import { CreateAttendanceGeofenceDto } from './create-attendance-geofence.dto';

export class UpdateAttendanceGeofenceDto extends PartialType(
  CreateAttendanceGeofenceDto,
) {}
