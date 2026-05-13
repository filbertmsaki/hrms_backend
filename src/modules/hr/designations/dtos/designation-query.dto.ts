import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class DesignationQueryDto extends PaginationDto {
  @IsString()
  @IsOptional()
  status?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  department_id?: number;
}
