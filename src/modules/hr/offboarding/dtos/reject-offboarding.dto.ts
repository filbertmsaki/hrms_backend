import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectOffboardingDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;
}
