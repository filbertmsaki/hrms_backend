import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AcsEventQueryDto {
  @IsString()
  @MaxLength(50)
  search_id: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  search_result_position: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  max_results: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  major?: number;

  @IsDateString()
  start_time: string;

  @IsDateString()
  end_time: string;
}
