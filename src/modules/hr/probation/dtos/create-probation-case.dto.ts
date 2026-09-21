import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class CreateProbationCaseDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id: number;

  @IsDateString()
  start_date: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  policy_id?: number;
}
