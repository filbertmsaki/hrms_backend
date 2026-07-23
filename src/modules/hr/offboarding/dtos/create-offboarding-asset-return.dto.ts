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
import { OffboardingAssetStatusEnum } from '../enums/offboarding-asset-status.enum';
import { OffboardingAssetTypeEnum } from '../enums/offboarding-asset-type.enum';

export class CreateOffboardingAssetReturnDto {
  @IsEnum(OffboardingAssetTypeEnum)
  asset_type: OffboardingAssetTypeEnum;

  @IsString()
  @MaxLength(180)
  asset_label: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  asset_identifier?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  owner_company_user_id?: number;

  @IsEnum(OffboardingAssetStatusEnum)
  @IsOptional()
  status?: OffboardingAssetStatusEnum;

  @IsDateString()
  @IsOptional()
  due_date?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  received_by_company_user_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  condition_notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  remarks?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
