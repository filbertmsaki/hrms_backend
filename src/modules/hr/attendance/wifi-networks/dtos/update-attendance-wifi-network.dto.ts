import { PartialType } from '@nestjs/mapped-types';
import { CreateAttendanceWifiNetworkDto } from './create-attendance-wifi-network.dto';

export class UpdateAttendanceWifiNetworkDto extends PartialType(
  CreateAttendanceWifiNetworkDto,
) {}