import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateProbationCaseDto {
  @IsDateString()
  @IsOptional()
  start_date?: string;

  @IsDateString()
  @IsOptional()
  current_due_date?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  policy_id?: number;
}
