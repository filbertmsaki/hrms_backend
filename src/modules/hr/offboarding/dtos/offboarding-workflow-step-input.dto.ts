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
import { OffboardingApprovalActionTypeEnum } from '../enums/offboarding-approval-action-type.enum';
import { OffboardingApproverTypeEnum } from '../enums/offboarding-approver-type.enum';
import { OffboardingTaskTypeEnum } from '../enums/offboarding-task-type.enum';

export class OffboardingWorkflowStepInputDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  approval_level: number;

  @IsString()
  @MaxLength(120)
  step_name: string;

  @IsString()
  @MaxLength(255)
  task_title: string;

  @IsOptional()
  @IsString()
  task_description?: string;

  @IsEnum(OffboardingTaskTypeEnum)
  @IsOptional()
  task_type?: OffboardingTaskTypeEnum;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  assigned_branch_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  assigned_department_id?: number;

  @IsEnum(OffboardingApproverTypeEnum)
  approver_type: OffboardingApproverTypeEnum;

  @ValidateIf(
    (o: OffboardingWorkflowStepInputDto) =>
      o.approver_type === OffboardingApproverTypeEnum.ROLE,
  )
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  role_id?: number;

  @ValidateIf(
    (o: OffboardingWorkflowStepInputDto) =>
      o.approver_type === OffboardingApproverTypeEnum.POSITION,
  )
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  position_id?: number;

  @ValidateIf(
    (o: OffboardingWorkflowStepInputDto) =>
      o.approver_type === OffboardingApproverTypeEnum.COMPANY_USER,
  )
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  company_user_id?: number;

  @IsEnum(OffboardingApprovalActionTypeEnum)
  action_type: OffboardingApprovalActionTypeEnum;

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
