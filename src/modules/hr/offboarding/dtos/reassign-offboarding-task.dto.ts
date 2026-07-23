import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ReassignOffboardingTaskDto {
  @Type(() => Number)
  @IsInt()
  assigned_to_company_user_id: number;

  @IsDateString()
  @IsOptional()
  due_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}
