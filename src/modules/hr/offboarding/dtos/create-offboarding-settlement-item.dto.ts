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
import { OffboardingSettlementItemTypeEnum } from '../enums/offboarding-settlement-item-type.enum';
import { OffboardingSettlementStatusEnum } from '../enums/offboarding-settlement-status.enum';

export class CreateOffboardingSettlementItemDto {
  @IsEnum(OffboardingSettlementItemTypeEnum)
  item_type: OffboardingSettlementItemTypeEnum;

  @IsString()
  @MaxLength(180)
  title: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  owner_company_user_id?: number;

  @IsEnum(OffboardingSettlementStatusEnum)
  @IsOptional()
  status?: OffboardingSettlementStatusEnum;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  amount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsDateString()
  @IsOptional()
  due_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  remarks?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
