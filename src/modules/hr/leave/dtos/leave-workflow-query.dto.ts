import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class LeaveWorkflowQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  status?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  leave_type_id?: number;
}
