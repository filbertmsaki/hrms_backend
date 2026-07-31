import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

type RefreshTransformInput = {
  value: unknown;
  obj: unknown;
};

type RefreshTransformSource = {
  startDate?: string;
  endDate?: string;
  processingSource?: AttendanceRefreshProcessingSourceEnum;
  processing_source?: AttendanceRefreshProcessingSourceEnum;
  mode?: AttendanceRefreshModeEnum;
  executionMode?: AttendanceRefreshExecutionModeEnum;
  execution_mode?: AttendanceRefreshExecutionModeEnum;
  execution?: AttendanceRefreshExecutionEnum;
  deviceId?: number | string;
  employeeId?: number | string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';

const readRefreshTransformSource = (value: unknown): RefreshTransformSource => {
  if (!isRecord(value)) {
    return {};
  }

  const source: RefreshTransformSource = {};

  if (typeof value.startDate === 'string') {
    source.startDate = value.startDate;
  }
  if (typeof value.endDate === 'string') {
    source.endDate = value.endDate;
  }
  if (
    value.processingSource ===
      AttendanceRefreshProcessingSourceEnum.FETCH_AND_PROCESS ||
    value.processingSource ===
      AttendanceRefreshProcessingSourceEnum.DATABASE_ONLY
  ) {
    source.processingSource = value.processingSource;
  }
  if (
    value.processing_source ===
      AttendanceRefreshProcessingSourceEnum.FETCH_AND_PROCESS ||
    value.processing_source ===
      AttendanceRefreshProcessingSourceEnum.DATABASE_ONLY
  ) {
    source.processing_source = value.processing_source;
  }
  if (
    value.mode === AttendanceRefreshModeEnum.SUMMARIES_ONLY ||
    value.mode === AttendanceRefreshModeEnum.FROM_RAW_LOGS
  ) {
    source.mode = value.mode;
  }
  if (
    value.executionMode === AttendanceRefreshExecutionModeEnum.BACKGROUND ||
    value.executionMode === AttendanceRefreshExecutionModeEnum.IMMEDIATE
  ) {
    source.executionMode = value.executionMode;
  }
  if (
    value.execution_mode === AttendanceRefreshExecutionModeEnum.BACKGROUND ||
    value.execution_mode === AttendanceRefreshExecutionModeEnum.IMMEDIATE
  ) {
    source.execution_mode = value.execution_mode;
  }
  if (
    value.execution === AttendanceRefreshExecutionEnum.SYNC ||
    value.execution === AttendanceRefreshExecutionEnum.ASYNC
  ) {
    source.execution = value.execution;
  }
  if (
    typeof value.deviceId === 'number' ||
    typeof value.deviceId === 'string'
  ) {
    source.deviceId = value.deviceId;
  }
  if (
    typeof value.employeeId === 'number' ||
    typeof value.employeeId === 'string'
  ) {
    source.employeeId = value.employeeId;
  }

  return source;
};

export enum AttendanceRefreshModeEnum {
  SUMMARIES_ONLY = 'summaries_only',
  FROM_RAW_LOGS = 'from_raw_logs',
}

export enum AttendanceRefreshExecutionEnum {
  SYNC = 'sync',
  ASYNC = 'async',
}

export enum AttendanceRefreshProcessingSourceEnum {
  FETCH_AND_PROCESS = 'fetch_and_process',
  DATABASE_ONLY = 'database_only',
}

export enum AttendanceRefreshExecutionModeEnum {
  BACKGROUND = 'background',
  IMMEDIATE = 'immediate',
}

export class RefreshAttendanceDailySummariesDto {
  @ApiProperty({ example: '2026-07-01' })
  @Transform(
    ({ value, obj }: RefreshTransformInput) => {
      const source = readRefreshTransformSource(obj);
      return value ?? source.startDate;
    },
    {
      toClassOnly: true,
    },
  )
  @IsDateString()
  start_date: string;

  @ApiProperty({ example: '2026-07-31' })
  @Transform(
    ({ value, obj }: RefreshTransformInput) => {
      const source = readRefreshTransformSource(obj);
      return value ?? source.endDate;
    },
    {
      toClassOnly: true,
    },
  )
  @IsDateString()
  end_date: string;

  @ApiPropertyOptional({
    enum: AttendanceRefreshProcessingSourceEnum,
    example: AttendanceRefreshProcessingSourceEnum.DATABASE_ONLY,
    description:
      'Unified refresh source. fetch_and_process pulls from Hikvision first; database_only reuses data already stored in the database.',
  })
  @Transform(
    ({ value, obj }: RefreshTransformInput) => {
      const source = readRefreshTransformSource(obj);
      return (
        value ??
        source.processingSource ??
        source.processing_source ??
        (source.mode === AttendanceRefreshModeEnum.FROM_RAW_LOGS
          ? AttendanceRefreshProcessingSourceEnum.DATABASE_ONLY
          : undefined)
      );
    },
    {
      toClassOnly: true,
    },
  )
  @IsEnum(AttendanceRefreshProcessingSourceEnum)
  @IsOptional()
  processing_source?: AttendanceRefreshProcessingSourceEnum;

  @ApiPropertyOptional({
    enum: AttendanceRefreshModeEnum,
    example: AttendanceRefreshModeEnum.FROM_RAW_LOGS,
    description:
      'Legacy refresh mode kept for backward compatibility. Prefer processing_source for new clients.',
  })
  @IsEnum(AttendanceRefreshModeEnum)
  @IsOptional()
  mode?: AttendanceRefreshModeEnum;

  @ApiPropertyOptional({
    enum: AttendanceRefreshExecutionModeEnum,
    example: AttendanceRefreshExecutionModeEnum.BACKGROUND,
  })
  @Transform(
    ({ value, obj }: RefreshTransformInput) => {
      const source = readRefreshTransformSource(obj);
      return (
        value ??
        source.executionMode ??
        source.execution_mode ??
        (source.execution === AttendanceRefreshExecutionEnum.SYNC
          ? AttendanceRefreshExecutionModeEnum.IMMEDIATE
          : source.execution === AttendanceRefreshExecutionEnum.ASYNC
            ? AttendanceRefreshExecutionModeEnum.BACKGROUND
            : AttendanceRefreshExecutionModeEnum.BACKGROUND)
      );
    },
    {
      toClassOnly: true,
    },
  )
  @IsEnum(AttendanceRefreshExecutionModeEnum)
  @IsOptional()
  execution_mode?: AttendanceRefreshExecutionModeEnum;

  @ApiPropertyOptional({
    enum: AttendanceRefreshExecutionEnum,
    example: AttendanceRefreshExecutionEnum.ASYNC,
    description:
      'Legacy execution selector kept for backward compatibility. Prefer execution_mode for new clients.',
  })
  @IsEnum(AttendanceRefreshExecutionEnum)
  @IsOptional()
  execution?: AttendanceRefreshExecutionEnum;

  @ApiPropertyOptional({ example: 12 })
  @Transform(
    ({ value, obj }: RefreshTransformInput) => {
      const source = readRefreshTransformSource(obj);
      return value ?? source.deviceId;
    },
    {
      toClassOnly: true,
    },
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  device_id?: number;

  @ApiPropertyOptional({ example: 94 })
  @Transform(
    ({ value, obj }: RefreshTransformInput) => {
      const source = readRefreshTransformSource(obj);
      return value ?? source.employeeId;
    },
    {
      toClassOnly: true,
    },
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employee_id?: number;
}
