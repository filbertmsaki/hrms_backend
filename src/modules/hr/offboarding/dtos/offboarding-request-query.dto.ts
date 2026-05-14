import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import { OffboardingRequestStatusEnum } from '../enums/offboarding-request-status.enum';
import { OffboardingTypeEnum } from '../enums/offboarding-type.enum';

export class OffboardingRequestQueryDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  employee_id?: number;

  @IsEnum(OffboardingRequestStatusEnum)
  @IsOptional()
  status?: OffboardingRequestStatusEnum;

  @IsEnum(OffboardingTypeEnum)
  @IsOptional()
  offboarding_type?: OffboardingTypeEnum;
}
