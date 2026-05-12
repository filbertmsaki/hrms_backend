import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class LeavePolicyQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  status?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  applicable_department_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  applicable_position_id?: number;
}
