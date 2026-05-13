import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class OnboardingApprovalActionDto {
  @Type(() => Boolean)
  @IsBoolean()
  approve: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;

  @ApiPropertyOptional({
    description: 'Optional signature URL/reference used during approval',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  signature_url?: string;
}
