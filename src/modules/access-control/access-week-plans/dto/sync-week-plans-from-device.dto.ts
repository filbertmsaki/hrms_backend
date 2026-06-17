import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SyncWeekPlansFromDeviceDto {
  // Optional single plan number for targeted sync-from-device.
  @ApiPropertyOptional({
    description: 'Hikvision week plan number to sync (example: "1")',
  })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  hikvision_plan_no?: string;
}
