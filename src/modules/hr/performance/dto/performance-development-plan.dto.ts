import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class PerformanceDevelopmentGoalDto {
  @IsString()
  @MaxLength(180)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsDateString()
  target_date?: string;

  @IsOptional()
  @IsString()
  success_measure?: string;

  @IsOptional()
  @IsString()
  support_required?: string;
}

export class CreatePerformanceDevelopmentPlanDto {
  @IsInt()
  @Min(1)
  employee_id: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  manager_employee_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  source_review_id?: number;

  @IsString()
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  target_completion_date?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PerformanceDevelopmentGoalDto)
  goals: PerformanceDevelopmentGoalDto[];
}

export class UpdatePerformanceDevelopmentGoalDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress_percent?: number;

  @IsOptional()
  @IsString()
  employee_comment?: string;

  @IsOptional()
  @IsString()
  manager_comment?: string;
}

export class CarryForwardPerformanceDevelopmentGoalsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  goal_ids: number[];

  @IsString()
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsDateString()
  target_completion_date?: string;
}
