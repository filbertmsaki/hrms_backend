import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { EmployeeDeviceAccessActionEnum } from '../enum/employee-device-access-action.enum';
import { EmployeeDeviceAccessAuditStatusEnum } from '../enum/employee-device-access-audit-status.enum';

export class QueryEmployeeDeviceAccessAuditLogDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  companyId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branchId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  deviceId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employeeId?: number;

  @IsString()
  @IsOptional()
  employeeNo?: string;

  @IsEnum(EmployeeDeviceAccessActionEnum)
  @IsOptional()
  action?: EmployeeDeviceAccessActionEnum;

  @IsEnum(EmployeeDeviceAccessAuditStatusEnum)
  @IsOptional()
  status?: EmployeeDeviceAccessAuditStatusEnum;

  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}

