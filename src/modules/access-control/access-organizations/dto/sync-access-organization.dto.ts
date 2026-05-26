import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class SyncAccessOrganizationDto {
  @ApiPropertyOptional({ description: 'Target single device id. If omitted, syncs all Hikvision devices in scope.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  device_id?: number;
}
