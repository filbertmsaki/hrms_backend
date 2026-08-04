import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, MinLength } from 'class-validator';

export class DelegateOffboardingApprovalDto {
  @Type(() => Number)
  @IsInt()
  target_company_user_id: number;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason: string;
}
