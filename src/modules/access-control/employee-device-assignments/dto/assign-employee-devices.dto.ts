import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { EmployeeDeviceUserSettingsDto } from './employee-device-user-settings.dto';

export class AssignEmployeeDevicesDto extends EmployeeDeviceUserSettingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  device_ids: number[];

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  sync_now?: boolean;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  continue_on_error?: boolean;
}
