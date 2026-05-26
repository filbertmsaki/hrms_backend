import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { AccessDayOfWeekEnum } from '../enum/access-day-of-week.enum';

export class CreateAccessWeekPlanDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  schedule_template_id: number;

  @IsString()
  @MaxLength(50)
  hikvision_plan_no: string;

  @IsEnum(AccessDayOfWeekEnum)
  day_of_week: AccessDayOfWeekEnum;

  @IsString()
  @Matches(/^\d{2}:\d{2}:\d{2}$/)
  start_time: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}:\d{2}$/)
  end_time: string;

  @ApiPropertyOptional({ description: 'Arbitrary metadata JSON object' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
