import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { OffboardingActionStatusEnum } from '../enums/offboarding-action-status.enum';
import { OffboardingActionTypeEnum } from '../enums/offboarding-action-type.enum';

export class CreateOffboardingActionDto {
  @IsEnum(OffboardingActionTypeEnum)
  action_type: OffboardingActionTypeEnum;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  system_name?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  owner_company_user_id?: number;

  @IsEnum(OffboardingActionStatusEnum)
  @IsOptional()
  status?: OffboardingActionStatusEnum;

  @IsDateString()
  @IsOptional()
  due_date?: string;

  @IsDateString()
  @IsOptional()
  requested_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  external_reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  error_message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
