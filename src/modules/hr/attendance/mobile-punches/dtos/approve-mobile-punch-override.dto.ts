import { IsOptional, IsString } from 'class-validator';

export class ApproveMobilePunchOverrideDto {
  @IsOptional()
  @IsString()
  reviewNote?: string;
}