import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import { AttendanceDailyStatusEnum } from '../../attendance/processing/enums/attendance-daily-status.enum';

export class MyAttendanceOverviewQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsDateString()
  @IsOptional()
  from_date?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsDateString()
  @IsOptional()
  to_date?: string;

  @ApiPropertyOptional({
    enum: AttendanceDailyStatusEnum,
    example: AttendanceDailyStatusEnum.PRESENT,
  })
  @IsEnum(AttendanceDailyStatusEnum)
  @IsOptional()
  status?: AttendanceDailyStatusEnum;
}
