import { IsOptional, IsString } from 'class-validator';

export class ProbationCaseQueryDto {
  @IsString()
  @IsOptional()
  status?: string;
}
