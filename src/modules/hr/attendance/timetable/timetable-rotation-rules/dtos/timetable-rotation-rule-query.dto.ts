import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';

export class TimetableRotationRuleQueryDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  rotation_id?: number;
}
