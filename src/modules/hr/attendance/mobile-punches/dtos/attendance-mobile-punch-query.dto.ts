import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional } from 'class-validator';
import { AttendancePunchTypeEnum } from '../enums/attendance-punch-type.enum';
import { AttendancePunchValidationStatusEnum } from '../enums/attendance-punch-validation-status.enum';
import { PaginationDto } from 'src/common/dto/pagination.dto';

export class AttendanceMobilePunchQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsEnum(AttendancePunchTypeEnum)
  punchType?: AttendancePunchTypeEnum;

  @IsOptional()
  @IsEnum(AttendancePunchValidationStatusEnum)
  validationStatus?: AttendancePunchValidationStatusEnum;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
