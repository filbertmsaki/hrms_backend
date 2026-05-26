import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateHikvisionDeviceDto } from './create-hikvision-device.dto';

export class UpdateHikvisionDeviceDto extends PartialType(CreateHikvisionDeviceDto) {
  @ApiPropertyOptional({
    description: 'If true, pull latest data from Hikvision and apply safe field sync after update',
    default: false,
  })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  sync_now?: boolean;
}
