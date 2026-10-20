import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { AttendanceRetentionCategory } from '../entities/attendance-data-retention-hold.entity';

export class CreateAttendanceRetentionHoldDto {
  @ApiProperty({
    enum: [
      'RAW_HIKVISION_LOG',
      'MOBILE_SELFIE',
      'ATTENDANCE_LOCATION',
      'FIELD_VISIT_LOCATION',
    ],
  })
  @IsIn([
    'RAW_HIKVISION_LOG',
    'MOBILE_SELFIE',
    'ATTENDANCE_LOCATION',
    'FIELD_VISIT_LOCATION',
  ])
  category: AttendanceRetentionCategory;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  recordId: number;

  @ApiProperty({ minLength: 5, maxLength: 1000 })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}
