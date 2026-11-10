import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { LeaveApproverTypeEnum } from '../enums/leave-approver-type.enum';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';

export class CreateLeaveManagementApprovalRuleDto {
  @ApiProperty({ example: 'Long annual leave' })
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ enum: LeaveRecordStatusEnum })
  @IsOptional()
  @IsEnum(LeaveRecordStatusEnum)
  status?: LeaveRecordStatusEnum;

  @ApiPropertyOptional({
    type: [Number],
    description: 'Empty = any leave type',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  leave_type_ids?: number[] | null;

  @ApiPropertyOptional({ example: 10, description: 'Request length threshold' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  min_total_days?: number | null;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  position_ids?: number[] | null;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  grade_ids?: number[] | null;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  department_ids?: number[] | null;

  @ApiProperty({ enum: LeaveApproverTypeEnum })
  @IsEnum(LeaveApproverTypeEnum)
  approver_type: LeaveApproverTypeEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  role_id?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  position_id?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  company_user_id?: number | null;
}

export class UpdateLeaveManagementApprovalRuleDto extends PartialType(
  CreateLeaveManagementApprovalRuleDto,
) {}
