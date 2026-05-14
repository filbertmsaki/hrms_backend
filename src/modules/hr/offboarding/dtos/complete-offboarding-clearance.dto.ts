import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OffboardingClearanceStatusEnum } from '../enums/offboarding-clearance-status.enum';

export class CompleteOffboardingClearanceDto {
  @IsEnum(OffboardingClearanceStatusEnum)
  status: OffboardingClearanceStatusEnum;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}
