import { IsBoolean } from 'class-validator';

export class StaffingPolicyDto {
  @IsBoolean() enforce_staffing_limit: boolean;
}
