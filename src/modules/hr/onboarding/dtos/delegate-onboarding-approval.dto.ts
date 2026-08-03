import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class DelegateOnboardingApprovalDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  delegate_company_user_id: number;

  @IsString()
  @MaxLength(1000)
  reason: string;
}
