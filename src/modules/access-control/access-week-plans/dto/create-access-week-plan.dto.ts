import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class AccessWeekPlanSegmentTimeDto {
  @IsString()
  @Matches(/^\d{2}:\d{2}:\d{2}$/)
  beginTime: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}:\d{2}$/)
  endTime: string;
}

class AccessWeekPlanSegmentDto {
  @IsString()
  week: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  @IsOptional()
  id?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  @IsOptional()
  segment_no?: number;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsOptional()
  enable?: boolean;

  @ValidateNested()
  @Type(() => AccessWeekPlanSegmentTimeDto)
  TimeSegment: AccessWeekPlanSegmentTimeDto;
}

export class CreateAccessWeekPlanDto {
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
  @MaxLength(50)
  hikvision_plan_no: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(150)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsOptional()
  enable?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [AccessWeekPlanSegmentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccessWeekPlanSegmentDto)
  @IsOptional()
  segments?: AccessWeekPlanSegmentDto[];

  @ApiPropertyOptional({ description: 'Arbitrary metadata JSON object' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
