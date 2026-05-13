import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class PositionQueryDto extends PaginationDto {
  @IsString()
  @IsOptional()
  status?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  branch_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  department_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  designation_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  reports_to_position_id?: number;
}
