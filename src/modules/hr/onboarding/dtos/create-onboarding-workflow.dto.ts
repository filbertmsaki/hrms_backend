import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { OnboardingRecordStatusEnum } from '../enums/onboarding-record-status.enum';
import { OnboardingWorkflowStepInputDto } from './onboarding-workflow-step-input.dto';

export class CreateOnboardingWorkflowDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_default?: boolean;

  @ApiPropertyOptional({ enum: OnboardingRecordStatusEnum, default: 'active' })
  @IsEnum(OnboardingRecordStatusEnum)
  @IsOptional()
  status?: OnboardingRecordStatusEnum;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OnboardingWorkflowStepInputDto)
  steps: OnboardingWorkflowStepInputDto[];
}
