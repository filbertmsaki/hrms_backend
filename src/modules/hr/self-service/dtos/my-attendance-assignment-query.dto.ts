import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class MyAttendanceAssignmentQueryDto {
  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsDateString()
  @IsOptional()
  from_date?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsDateString()
  @IsOptional()
  to_date?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Include inactive/cancelled assignments',
  })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  include_inactive?: boolean;
}