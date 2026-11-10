import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class QueryAttendanceExemptionCandidatesDto {
  @ApiPropertyOptional({
    default: 30,
    description: 'Suggest employees with no punches in this many days.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  inactive_days?: number = 30;
}

export class UpdateAttendanceExemptionsDto {
  @ApiProperty({ type: [Number], example: [12, 15] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  employee_ids: number[];

  @ApiProperty({
    example: '2026-08-01',
    nullable: true,
    description: 'Exempt from this date; null puts employees back on tracking.',
  })
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  exempt_from: string | null;

  @ApiPropertyOptional({ example: 'Field staff, no device at site' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description:
      'Recalculate attendance from this date. Defaults to exempt_from, or the previous exempt date when clearing.',
  })
  @IsDateString()
  @IsOptional()
  recalculate_from?: string;
}
