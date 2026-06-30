import { IsDateString, IsInt, IsOptional } from 'class-validator';

export class ReassignOnboardingTaskDto {
  @IsOptional()
  @IsInt()
  assigned_company_user_id?: number;

  @IsOptional()
  @IsInt()
  assigned_department_id?: number;

  @IsOptional()
  @IsDateString()
  due_date?: string;
}
