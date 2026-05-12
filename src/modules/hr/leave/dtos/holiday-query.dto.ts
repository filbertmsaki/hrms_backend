import { IsDateString, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class HolidayQueryDto extends PaginationDto {
  @IsOptional()
  @IsDateString()
  from_date?: string;

  @IsOptional()
  @IsDateString()
  to_date?: string;
}
