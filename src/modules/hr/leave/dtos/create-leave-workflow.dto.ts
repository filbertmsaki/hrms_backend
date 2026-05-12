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
  ValidateNested,
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
