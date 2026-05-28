import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { EmployeeBiometricCaptureStatusEnum } from '../enum/employee-biometric-capture-status.enum';
import { EmployeeBiometricCaptureTypeEnum } from '../enum/employee-biometric-capture-type.enum';

export class CreateBiometricCaptureSessionDto {
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

  @IsEnum(EmployeeBiometricCaptureTypeEnum)
  capture_type: EmployeeBiometricCaptureTypeEnum;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  fingerprint_id?: string | null;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  face_id?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  card_reader_no?: number | null;

  @IsEnum(EmployeeBiometricCaptureStatusEnum)
  @IsOptional()
  status?: EmployeeBiometricCaptureStatusEnum;

  @IsDateString()
  @IsOptional()
  expires_at?: string;

  @IsObject()
  @IsOptional()
  capture_request_payload?: Record<string, unknown> | null;

  @IsObject()
  @IsOptional()
  setup_request_payload?: Record<string, unknown> | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  performed_by_company_user_id?: number | null;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown> | null;
}

