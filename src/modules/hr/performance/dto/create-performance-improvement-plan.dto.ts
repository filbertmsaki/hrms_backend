import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreatePerformanceImprovementMilestoneDto {
  @IsString()
  @MaxLength(180)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  due_date: string;
}

export class CreatePerformanceImprovementPlanDto {
  @IsString()
  summary: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  objectives: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePerformanceImprovementMilestoneDto)
  milestones: CreatePerformanceImprovementMilestoneDto[];
}
