import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EmployeeDeviceUserRightPlanDto } from './employee-device-user-right-plan.dto';

export class EmployeeDeviceUserSettingsDto {
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
  @IsString()
  @MaxLength(255)
  @IsOptional()
  door_right?: string | null;

  @ApiPropertyOptional({ type: () => [EmployeeDeviceUserRightPlanDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeDeviceUserRightPlanDto)
  @IsOptional()
  right_plan?: EmployeeDeviceUserRightPlanDto[];

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
