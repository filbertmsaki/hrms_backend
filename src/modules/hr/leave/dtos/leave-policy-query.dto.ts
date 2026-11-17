import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
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

  /** Include superseded and archived versions (default: current + drafts). */
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  include_history?: boolean;
}
