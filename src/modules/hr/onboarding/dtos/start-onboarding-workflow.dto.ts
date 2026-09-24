import { IsBoolean, IsOptional } from 'class-validator';

export class StartOnboardingWorkflowDto {
  @IsBoolean()
  @IsOptional()
  allow_incomplete_employee_details?: boolean;
}
