import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { EmployeeDeviceAccessActionEnum } from '../enum/employee-device-access-action.enum';
import { EmployeeDeviceAccessAuditStatusEnum } from '../enum/employee-device-access-audit-status.enum';

export class CreateEmployeeDeviceAccessAuditLogDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  company_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employee_id?: number | null;

  @IsString()
  @MaxLength(100)
  employee_no: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  employee_name?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  device_id: number;

  @IsEnum(EmployeeDeviceAccessActionEnum)
  action: EmployeeDeviceAccessActionEnum;

  @IsEnum(EmployeeDeviceAccessAuditStatusEnum)
  @IsOptional()
  status?: EmployeeDeviceAccessAuditStatusEnum;

  @IsObject()
  @IsOptional()
  request_payload?: Record<string, unknown> | null;

  @IsObject()
  @IsOptional()
  response_payload?: Record<string, unknown> | null;

  @IsObject()
  @IsOptional()
  old_values?: Record<string, unknown> | null;

  @IsObject()
  @IsOptional()
  new_values?: Record<string, unknown> | null;

  @IsString()
  @IsOptional()
  error_message?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  performed_by_company_user_id?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  performed_by_user_id?: number | null;

  @IsString()
  @MaxLength(45)
  @IsOptional()
  ip_address?: string | null;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  user_agent?: string | null;
}

