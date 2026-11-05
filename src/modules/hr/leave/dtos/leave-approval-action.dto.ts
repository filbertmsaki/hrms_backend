import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
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

/** Same decision applied to several requests; each is checked on its own. */
export class BulkLeaveApprovalActionDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];

  @ApiProperty({ enum: LeaveApprovalActionEnum })
  @IsEnum(LeaveApprovalActionEnum)
  action: LeaveApprovalActionEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;
}
