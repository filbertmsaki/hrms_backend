import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CloneOnboardingWorkflowDto {
  @IsString()
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_default?: boolean;
}
