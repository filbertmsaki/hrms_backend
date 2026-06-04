import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EmployeeDeviceUserSettingsDto {
  @ApiPropertyOptional({
    description:
      'Hikvision device employee number to link or register. This is not the backend employees.employee_no.',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  employee_no?: string;

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

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  user_verify_mode?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(50)
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({ description: 'Arbitrary metadata JSON object' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
