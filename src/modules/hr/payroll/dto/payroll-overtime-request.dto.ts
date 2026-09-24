import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePayrollOvertimeRequestDto {
  @IsDateString()
  work_date: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  requested_minutes: number;

  @IsString()
  @MaxLength(2000)
  reason: string;
}

export class DecidePayrollOvertimeRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;
}
