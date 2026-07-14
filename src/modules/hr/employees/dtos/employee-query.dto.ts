import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import { EmploymentStatusEnum } from '../enums/employment-status.enum';

export class EmployeeQueryDto extends PaginationDto {
  @IsEnum(EmploymentStatusEnum)
  @IsOptional()
  employment_status?: EmploymentStatusEnum;

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
  primary_position_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  position_id?: number;
}
