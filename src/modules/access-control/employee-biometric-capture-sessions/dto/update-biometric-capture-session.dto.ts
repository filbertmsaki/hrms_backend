import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { EmployeeBiometricCaptureStatusEnum } from '../enum/employee-biometric-capture-status.enum';

export class UpdateBiometricCaptureSessionDto {
  @IsEnum(EmployeeBiometricCaptureStatusEnum)
  @IsOptional()
  status?: EmployeeBiometricCaptureStatusEnum;

  @IsObject()
  @IsOptional()
  capture_response_payload?: Record<string, unknown> | null;

  @IsObject()
  @IsOptional()
  setup_response_payload?: Record<string, unknown> | null;

  @IsString()
  @IsOptional()
  error_message?: string | null;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown> | null;
}
