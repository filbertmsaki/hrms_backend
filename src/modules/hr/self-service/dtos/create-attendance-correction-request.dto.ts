import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AttendanceCorrectionRequestTypeEnum } from '../enums/attendance-correction-request-type.enum';

export class CreateAttendanceCorrectionRequestDto {
  @ApiProperty({ example: '2026-06-20' })
  @IsDateString()
  attendance_date: string;

  @ApiProperty({ enum: AttendanceCorrectionRequestTypeEnum })
  @IsEnum(AttendanceCorrectionRequestTypeEnum)
  request_type: AttendanceCorrectionRequestTypeEnum;

  @ApiPropertyOptional({ example: '2026-06-20T08:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  requested_check_in_at?: string | null;

  @ApiPropertyOptional({ example: '2026-06-20T17:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  requested_check_out_at?: string | null;

  @ApiPropertyOptional({ example: 'PRESENT' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  requested_status?: string | null;

  @ApiPropertyOptional({ example: 'Device was offline, I checked in manually' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}
