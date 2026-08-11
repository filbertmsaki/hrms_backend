import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ReportOutputFormatEnum } from '../enums/report-output-format.enum';

export class RunReportTemplateDto {
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @IsEnum(ReportOutputFormatEnum)
  output_format?: ReportOutputFormatEnum;
}
