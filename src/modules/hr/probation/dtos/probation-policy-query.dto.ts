import { IsOptional, IsString } from 'class-validator';

export class ProbationPolicyQueryDto {
  @IsString()
  @IsOptional()
  status?: string;
}
