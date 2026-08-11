import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { EmploymentStatusEnum } from '../enums/employment-status.enum';

export class ChangeEmployeeStatusDto {
  @ApiPropertyOptional({
    enum: EmploymentStatusEnum,
  })
  @IsEnum(EmploymentStatusEnum)
  employment_status: EmploymentStatusEnum;

  @IsDateString()
  effective_date: string;

  @IsDateString()
  @IsOptional()
  exit_date?: string;

  @IsString()
  @IsOptional()
  exit_reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
