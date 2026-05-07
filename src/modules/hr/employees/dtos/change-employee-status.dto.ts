import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class ChangeEmployeeStatusDto {
  @ApiPropertyOptional({
    enum: ['onboarding', 'active', 'suspended', 'terminated', 'exited'],
  })
  @IsIn(['onboarding', 'active', 'suspended', 'terminated', 'exited'])
  employment_status: string;

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
