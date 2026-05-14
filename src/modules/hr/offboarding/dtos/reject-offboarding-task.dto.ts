import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectOffboardingTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}
