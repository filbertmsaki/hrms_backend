import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { TimetableRotationStatusEnum } from '../enums/timetable-rotation-status.enum';

export class CreateTimetableRotationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  timetable_id: number;

  @IsString()
  @MaxLength(120)
  name: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cycle_days: number;

  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TimetableRotationStatusEnum })
  @IsEnum(TimetableRotationStatusEnum)
  @IsOptional()
  status?: TimetableRotationStatusEnum;
}
