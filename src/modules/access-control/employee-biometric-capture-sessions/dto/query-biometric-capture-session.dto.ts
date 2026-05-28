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
import { EmployeeBiometricCaptureStatusEnum } from '../enum/employee-biometric-capture-status.enum';
import { EmployeeBiometricCaptureTypeEnum } from '../enum/employee-biometric-capture-type.enum';

export class QueryBiometricCaptureSessionDto {
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

  @IsEnum(EmployeeBiometricCaptureTypeEnum)
  @IsOptional()
  captureType?: EmployeeBiometricCaptureTypeEnum;

  @IsEnum(EmployeeBiometricCaptureStatusEnum)
  @IsOptional()
  status?: EmployeeBiometricCaptureStatusEnum;

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

