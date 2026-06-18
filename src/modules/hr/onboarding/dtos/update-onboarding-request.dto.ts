import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { OnboardingProvisioningDto } from './onboarding-provisioning.dto';

export class UpdateOnboardingRequestDto {
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  workflow_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @IsOptional()
  @IsDateString()
  planned_start_date?: string;

  @IsOptional()
  @IsDateString()
  planned_completion_date?: string;

  @ValidateNested()
  @Type(() => OnboardingProvisioningDto)
  @IsOptional()
  provisioning?: OnboardingProvisioningDto;
}
