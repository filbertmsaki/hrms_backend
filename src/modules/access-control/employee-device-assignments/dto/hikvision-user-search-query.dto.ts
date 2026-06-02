import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class HikvisionUserSearchQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search_id?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  search_result_position?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  max_results?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  employee_no?: string;
}
