import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { LeaveDurationTypeEnum } from '../enums/leave-duration-type.enum';
import { LeaveHalfDaySessionEnum } from '../enums/leave-half-day-session.enum';

export class CreateLeaveRequestDto {
  @Type(() => Number)
  @IsInt()
  employee_id: number;

  @Type(() => Number)
  @IsInt()
  leave_type_id: number;

  @IsEnum(LeaveDurationTypeEnum)
  @IsOptional()
  duration_type?: LeaveDurationTypeEnum;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  @ValidateIf(
    (dto: CreateLeaveRequestDto) =>
      dto.duration_type === LeaveDurationTypeEnum.HALF_DAY,
  )
  @IsEnum(LeaveHalfDaySessionEnum)
  half_day_session?: LeaveHalfDaySessionEnum;

  @ValidateIf(
    (dto: CreateLeaveRequestDto) =>
      dto.duration_type === LeaveDurationTypeEnum.SHORT_LEAVE,
  )
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  start_time?: string;

  @ValidateIf(
    (dto: CreateLeaveRequestDto) =>
      dto.duration_type === LeaveDurationTypeEnum.SHORT_LEAVE,
  )
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  end_time?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  evidence_document_id?: number;

  @IsString()
  @MaxLength(2000)
  reason: string;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  submit?: boolean;
}
