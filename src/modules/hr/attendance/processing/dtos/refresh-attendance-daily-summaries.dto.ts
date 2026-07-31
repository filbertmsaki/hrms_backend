import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum } from 'class-validator';

export enum AttendanceRefreshModeEnum {
  SUMMARIES_ONLY = 'summaries_only',
  FROM_RAW_LOGS = 'from_raw_logs',
}

export enum AttendanceRefreshExecutionEnum {
  SYNC = 'sync',
  ASYNC = 'async',
}

export class RefreshAttendanceDailySummariesDto {
  @ApiProperty({ example: '2026-07-01' })
  @IsDateString()
  start_date: string;

  @ApiProperty({ example: '2026-07-31' })
  @IsDateString()
  end_date: string;

  @ApiProperty({
    enum: AttendanceRefreshModeEnum,
    example: AttendanceRefreshModeEnum.FROM_RAW_LOGS,
  })
  @IsEnum(AttendanceRefreshModeEnum)
  mode: AttendanceRefreshModeEnum;

  @ApiProperty({
    enum: AttendanceRefreshExecutionEnum,
    example: AttendanceRefreshExecutionEnum.ASYNC,
  })
  @IsEnum(AttendanceRefreshExecutionEnum)
  execution: AttendanceRefreshExecutionEnum;
}
