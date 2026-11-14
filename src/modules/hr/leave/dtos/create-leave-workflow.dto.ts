import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
  Max,
} from 'class-validator';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeaveWorkflowStepInputDto } from './leave-workflow-step-input.dto';

export class CreateLeaveWorkflowDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  leave_type_id?: number;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_default?: boolean;

  @ApiPropertyOptional({
    description: 'Remind pending approvers every N days; null = off',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  reminder_after_days?: number | null;

  @ApiPropertyOptional({
    description:
      'Escalate after M days waiting and again every M days; null = off',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  escalate_after_days?: number | null;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: 5,
    description:
      'Maximum escalations per stage; afterwards HR is flagged once',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  max_escalations?: number;

  @ApiPropertyOptional({ enum: LeaveRecordStatusEnum, default: 'active' })
  @IsEnum(LeaveRecordStatusEnum)
  @IsOptional()
  status?: LeaveRecordStatusEnum;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LeaveWorkflowStepInputDto)
  steps: LeaveWorkflowStepInputDto[];
}
