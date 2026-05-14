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
import { OffboardingRecordStatusEnum } from '../enums/offboarding-record-status.enum';
import { OffboardingWorkflowStepInputDto } from './offboarding-workflow-step-input.dto';

export class CreateOffboardingWorkflowDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_default?: boolean;

  @IsEnum(OffboardingRecordStatusEnum)
  @IsOptional()
  status?: OffboardingRecordStatusEnum;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OffboardingWorkflowStepInputDto)
  steps: OffboardingWorkflowStepInputDto[];
}
