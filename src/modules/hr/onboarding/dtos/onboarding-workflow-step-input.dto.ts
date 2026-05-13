import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { OnboardingApprovalActionTypeEnum } from '../enums/onboarding-approval-action-type.enum';
import { OnboardingApproverTypeEnum } from '../enums/onboarding-approver-type.enum';
import { OnboardingTaskTypeEnum } from '../enums/onboarding-task-type.enum';

export class OnboardingWorkflowStepInputDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  approval_level: number;

  @IsString()
  @MaxLength(120)
  step_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  task_title?: string;

  @IsOptional()
  @IsString()
  task_description?: string;

  @ApiPropertyOptional({ enum: OnboardingTaskTypeEnum, default: 'general' })
  @IsEnum(OnboardingTaskTypeEnum)
  @IsOptional()
  task_type?: OnboardingTaskTypeEnum;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  assigned_branch_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  assigned_department_id?: number;

  @IsEnum(OnboardingApproverTypeEnum)
  approver_type: OnboardingApproverTypeEnum;

  @ValidateIf(
    (o: OnboardingWorkflowStepInputDto) =>
      o.approver_type === OnboardingApproverTypeEnum.ROLE,
  )
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  role_id?: number;

  @ValidateIf(
    (o: OnboardingWorkflowStepInputDto) =>
      o.approver_type === OnboardingApproverTypeEnum.POSITION,
  )
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  position_id?: number;

  @ValidateIf(
    (o: OnboardingWorkflowStepInputDto) =>
      o.approver_type === OnboardingApproverTypeEnum.COMPANY_USER,
  )
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  company_user_id?: number;

  @IsEnum(OnboardingApprovalActionTypeEnum)
  action_type: OnboardingApprovalActionTypeEnum;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_required?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  expected_duration_days?: number;
}
