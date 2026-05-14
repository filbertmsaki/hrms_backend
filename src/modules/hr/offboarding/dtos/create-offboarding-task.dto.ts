import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { OffboardingTaskPriorityEnum } from '../enums/offboarding-task-priority.enum';
import { OffboardingTaskTypeEnum } from '../enums/offboarding-task-type.enum';

export class CreateOffboardingTaskDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(OffboardingTaskTypeEnum)
  @IsOptional()
  task_type?: OffboardingTaskTypeEnum;

  @IsEnum(OffboardingTaskPriorityEnum)
  @IsOptional()
  priority?: OffboardingTaskPriorityEnum;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  assigned_to_company_user_id?: number;

  @IsDateString()
  @IsOptional()
  due_date?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
