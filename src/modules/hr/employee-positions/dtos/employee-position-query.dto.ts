import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import { EmployeePositionStatusEnum } from '../../employees/enums/employee-position-status.enum';

export class EmployeePositionQueryDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  employee_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  position_id?: number;

  @IsEnum(EmployeePositionStatusEnum)
  @IsOptional()
  status?: EmployeePositionStatusEnum;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;
}
