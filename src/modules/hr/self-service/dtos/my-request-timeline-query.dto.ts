import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class MyRequestTimelineQueryDto extends PaginationDto {
  @IsString()
  @IsOptional()
  module?: string;

  @IsString()
  @IsOptional()
  status?: string;
}
