import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import { OffboardingClearanceStatusEnum } from '../enums/offboarding-clearance-status.enum';
import { OffboardingClearanceTypeEnum } from '../enums/offboarding-clearance-type.enum';

export class MyOffboardingClearanceQueryDto extends PaginationDto {
  @IsEnum(OffboardingClearanceStatusEnum)
  @IsOptional()
  status?: OffboardingClearanceStatusEnum;

  @IsEnum(OffboardingClearanceTypeEnum)
  @IsOptional()
  clearance_type?: OffboardingClearanceTypeEnum;
}
