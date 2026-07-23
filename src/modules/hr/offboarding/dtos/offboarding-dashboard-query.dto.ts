import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional } from 'class-validator';
import { OffboardingRequestStatusEnum } from '../enums/offboarding-request-status.enum';
import { OffboardingTypeEnum } from '../enums/offboarding-type.enum';

export class OffboardingDashboardQueryDto {
  @IsDateString()
  @IsOptional()
  date_from?: string;

  @IsDateString()
  @IsOptional()
  date_to?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  branch_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  department_id?: number;

  @IsEnum(OffboardingRequestStatusEnum)
  @IsOptional()
  status?: OffboardingRequestStatusEnum;

  @IsEnum(OffboardingTypeEnum)
  @IsOptional()
  offboarding_type?: OffboardingTypeEnum;
}
