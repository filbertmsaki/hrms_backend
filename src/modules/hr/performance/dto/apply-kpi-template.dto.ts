import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';

export class ApplyKpiTemplateDto {
  @Type(() => Number)
  @IsInt()
  template_id: number;

  @IsOptional()
  @IsIn(['SKIP', 'MERGE', 'REPLACE'])
  conflict_policy?: 'SKIP' | 'MERGE' | 'REPLACE';
}
