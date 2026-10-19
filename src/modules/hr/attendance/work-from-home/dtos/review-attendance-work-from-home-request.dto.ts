import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum AttendanceWorkFromHomeReviewDecisionEnum {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class ReviewAttendanceWorkFromHomeRequestDto {
  @ApiProperty({ enum: AttendanceWorkFromHomeReviewDecisionEnum })
  @IsEnum(AttendanceWorkFromHomeReviewDecisionEnum)
  decision: AttendanceWorkFromHomeReviewDecisionEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
