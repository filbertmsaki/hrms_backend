import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class LeaveApprovalActionDto {
  @ApiPropertyOptional({
    description: 'True to approve current step, false to reject',
    default: true,
  })
  @Type(() => Boolean)
  @IsBoolean()
  approve: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;

  @IsOptional()
  @IsString()
  signature_url?: string;
}
