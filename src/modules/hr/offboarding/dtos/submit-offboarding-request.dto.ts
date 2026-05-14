import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class SubmitOffboardingRequestDto {
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  workflow_id?: number;
}
