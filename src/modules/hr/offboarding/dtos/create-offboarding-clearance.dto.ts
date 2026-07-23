import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { OffboardingClearanceStatusEnum } from '../enums/offboarding-clearance-status.enum';
import { OffboardingClearanceTypeEnum } from '../enums/offboarding-clearance-type.enum';

export class CreateOffboardingClearanceDto {
  @IsEnum(OffboardingClearanceTypeEnum)
  clearance_type: OffboardingClearanceTypeEnum;

  @IsEnum(OffboardingClearanceStatusEnum)
  @IsOptional()
  status?: OffboardingClearanceStatusEnum;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  owner_company_user_id?: number;

  @IsDateString()
  @IsOptional()
  due_date?: string;
}
