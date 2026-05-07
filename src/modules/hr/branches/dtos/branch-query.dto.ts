import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class BranchQueryDto extends PaginationDto {
  @IsString()
  @IsOptional()
  status?: string;
}
