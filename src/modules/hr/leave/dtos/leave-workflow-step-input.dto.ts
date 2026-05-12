import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import { LeaveApprovalActionTypeEnum } from '../enums/leave-approval-action-type.enum';
import { LeaveApproverTypeEnum } from '../enums/leave-approver-type.enum';

export class LeaveWorkflowStepInputDto {
  @Type(() => Number)
  @IsInt()
  approval_level: number;

  @IsEnum(LeaveApproverTypeEnum)
  approver_type: LeaveApproverTypeEnum;

  @ValidateIf((o: LeaveWorkflowStepInputDto) => o.approver_type === LeaveApproverTypeEnum.ROLE)
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  role_id?: number;

  @ValidateIf(
    (o: LeaveWorkflowStepInputDto) =>
      o.approver_type === LeaveApproverTypeEnum.POSITION,
  )
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  position_id?: number;

  @ValidateIf(
    (o: LeaveWorkflowStepInputDto) =>
      o.approver_type === LeaveApproverTypeEnum.COMPANY_USER,
  )
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  company_user_id?: number;

  @IsEnum(LeaveApprovalActionTypeEnum)
  action_type: LeaveApprovalActionTypeEnum;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_required?: boolean;
}
