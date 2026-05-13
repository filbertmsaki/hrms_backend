import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class EmployeeDesignationQueryDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  employee_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  designation_id?: number;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_current?: boolean;
}
