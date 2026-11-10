import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class LeaveRequestQueryDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  employee_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  leave_type_id?: number;

  /** Applicant's primary department. */
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  department_id?: number;

  /** Requests from this manager's direct reports or managed department. */
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  manager_employee_id?: number;

  /** A status, or "pending" for every stage still awaiting a decision. */
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  from_date?: string;

  @IsOptional()
  @IsDateString()
  to_date?: string;
}
