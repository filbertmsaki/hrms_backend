import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { LeaveApprovalActionEnum } from '../enums/leave-approval-action.enum';

export class LeaveApprovalActionDto {
  @ApiProperty({
    enum: LeaveApprovalActionEnum,
    description: 'Decision for the current approval step',
  })
  @IsEnum(LeaveApprovalActionEnum)
  action: LeaveApprovalActionEnum;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;

  @IsOptional()
  @IsString()
  signature_url?: string;
}
