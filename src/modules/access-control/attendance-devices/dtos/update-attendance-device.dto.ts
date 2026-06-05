import { PartialType } from '@nestjs/mapped-types';
import { CreateAttendanceDeviceDto } from './create-attendance-device.dto';

export class UpdateAttendanceDeviceDto extends PartialType(CreateAttendanceDeviceDto) {}
