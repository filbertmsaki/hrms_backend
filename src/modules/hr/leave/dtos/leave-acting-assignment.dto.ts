import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** Acting employee appointed for the leave (defaults to the leave dates). */
export class LeaveActingAssignmentDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  acting_employee_id: number;

  @ApiPropertyOptional({ example: '2026-12-01' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ example: '2026-12-15' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  responsibilities?: string;

  @ApiPropertyOptional({
    description:
      'Route the absent employee’s leave approvals to the acting employee for the delegation period (time-limited, audited).',
  })
  @IsOptional()
  @IsBoolean()
  route_approvals?: boolean;
}

export class CancelLeaveActingAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CheckLeaveActingCandidateDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  acting_employee_id: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  end_date?: string;
}
