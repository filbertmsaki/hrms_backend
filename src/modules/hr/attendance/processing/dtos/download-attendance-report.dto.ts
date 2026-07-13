import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { QueryAttendanceDailySummariesDto } from './query-attendance-daily-summaries.dto';
import { AttendanceReportFormatEnum } from './attendance-report-format.enum';

export class DownloadAttendanceReportDto extends QueryAttendanceDailySummariesDto {
  @ApiProperty({
    enum: AttendanceReportFormatEnum,
    example: AttendanceReportFormatEnum.XLSX,
    description: 'Supported report output formats',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEnum(AttendanceReportFormatEnum, {
    message: 'format must be one of: xlsx, csv, pdf',
  })
  format: AttendanceReportFormatEnum;
}
