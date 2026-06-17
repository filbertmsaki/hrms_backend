import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { AttendanceHolidayTypeEnum } from '../enums/attendance-holiday-type.enum';

export class AttendanceHolidayQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  holiday_group_id?: number;

  @ApiPropertyOptional({ enum: AttendanceHolidayTypeEnum })
  @IsEnum(AttendanceHolidayTypeEnum)
  @IsOptional()
  type?: AttendanceHolidayTypeEnum;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  from_date?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  to_date?: string;
}
