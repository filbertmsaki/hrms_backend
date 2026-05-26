import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { AccessDoorSyncStatusEnum } from '../enum/access-door-sync-status.enum';

export class CreateAccessDoorDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  device_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  door_no: number;

  @IsString()
  @MaxLength(150)
  door_name: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(50)
  @IsOptional()
  magnetic_type?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(50)
  @IsOptional()
  open_button_type?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  open_duration?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  disabled_open_duration?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  magnetic_alarm_timeout?: number;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  enable_leader_card?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(50)
  @IsOptional()
  leader_card_mode?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  leader_card_open_duration?: number;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  remote_control_pw_status?: boolean;

  @ApiPropertyOptional({ enum: AccessDoorSyncStatusEnum })
  @IsEnum(AccessDoorSyncStatusEnum)
  @IsOptional()
  sync_status?: AccessDoorSyncStatusEnum;

  @ApiPropertyOptional({ description: 'Arbitrary metadata JSON object' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
