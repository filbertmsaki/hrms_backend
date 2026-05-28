import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { AccessScheduleTemplateStatusEnum } from '../enum/access-schedule-template-status.enum';
import { AccessScheduleTemplateTypeEnum } from '../enum/access-schedule-template-type.enum';

export class CreateAccessScheduleTemplateDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  device_id: number;

  @IsString()
  @MaxLength(150)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(150)
  template_name: string;

  @IsString()
  @MaxLength(50)
  hikvision_template_no: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  week_plan_id: number;

  @IsString()
  @MaxLength(50)
  hikvision_week_plan_no: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(50)
  @IsOptional()
  holiday_group_no?: string;

  @ApiPropertyOptional({ enum: AccessScheduleTemplateTypeEnum })
  @IsEnum(AccessScheduleTemplateTypeEnum)
  @IsOptional()
  schedule_type?: AccessScheduleTemplateTypeEnum;

  @ApiPropertyOptional({ enum: AccessScheduleTemplateStatusEnum })
  @IsEnum(AccessScheduleTemplateStatusEnum)
  @IsOptional()
  status?: AccessScheduleTemplateStatusEnum;

  @ApiPropertyOptional({ description: 'Arbitrary metadata JSON object' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
