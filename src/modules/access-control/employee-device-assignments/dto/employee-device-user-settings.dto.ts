import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EmployeeDeviceUserSettingsDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  access_group_id: number;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  valid_enabled?: boolean;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  valid_begin_time?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  valid_end_time?: string;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  local_ui_right?: boolean;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  close_delay_enabled?: boolean;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  max_open_door_time?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  open_door_time?: number;

  @ApiPropertyOptional({ description: 'Arbitrary metadata JSON object' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
