import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class LeaveBalanceAdjustmentQueryDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  employee_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  leave_type_id?: number;

  @Matches(/^\d{4}$/)
  @IsString()
  @IsOptional()
  fiscal_year?: string;
}
