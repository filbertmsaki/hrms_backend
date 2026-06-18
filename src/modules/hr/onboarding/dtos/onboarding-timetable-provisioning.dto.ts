import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class OnboardingTimetableProvisioningDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  timetable_id: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  effective_from?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  effective_to?: string | null;
}
