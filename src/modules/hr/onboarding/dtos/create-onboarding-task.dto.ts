import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { OnboardingTaskTypeEnum } from '../enums/onboarding-task-type.enum';

export class CreateOnboardingTaskDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(OnboardingTaskTypeEnum)
  @IsOptional()
  task_type?: OnboardingTaskTypeEnum;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  assigned_department_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  assigned_company_user_id?: number;

  @IsDateString()
  @IsOptional()
  due_date?: string;
}
