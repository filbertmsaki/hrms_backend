import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class OffboardingApprovalActionDto {
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  approve?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;
}
