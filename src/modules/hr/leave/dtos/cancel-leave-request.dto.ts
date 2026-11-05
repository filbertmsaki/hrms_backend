import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelLeaveRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class EndLeaveEarlyDto {
  @ApiProperty({ example: '2026-12-16', description: 'New last day of leave' })
  @IsDateString()
  new_end_date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}
