import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SyncAttendanceByDateDto {
  @ApiProperty({ example: '2026-05-29' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @ApiPropertyOptional({ example: 'Africa/Dar_es_Salaam' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  timezone?: string;
}
