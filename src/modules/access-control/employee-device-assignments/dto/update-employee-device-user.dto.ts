import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { EmployeeDeviceUserSettingsDto } from './employee-device-user-settings.dto';

export class UpdateEmployeeDeviceUserDto extends EmployeeDeviceUserSettingsDto {
  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  sync_now?: boolean;
}
