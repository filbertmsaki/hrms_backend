import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import { OffboardingApprovalStatusEnum } from '../enums/offboarding-approval-status.enum';

export class MyOffboardingApprovalQueryDto extends PaginationDto {
  @IsEnum(OffboardingApprovalStatusEnum)
  @IsOptional()
  status?: OffboardingApprovalStatusEnum;
}
