import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class MovementPolicyDto {
  @IsBoolean()
  require_management_approval: boolean;

  @IsBoolean()
  allow_backdating: boolean;

  @IsInt()
  @Min(0)
  @Max(2147483647)
  max_backdate_days: number;
}
