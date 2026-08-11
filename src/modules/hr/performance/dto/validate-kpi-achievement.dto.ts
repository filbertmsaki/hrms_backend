import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class ValidateKpiAchievementDto {
  @IsOptional()
  @IsNumber()
  achievement_value?: number;

  @IsOptional()
  @IsString()
  manager_comment?: string;

  @IsOptional()
  @IsString()
  override_reason?: string;

  @IsOptional()
  @IsBoolean()
  submit_for_hr?: boolean;
}
