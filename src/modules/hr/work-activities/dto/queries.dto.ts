import { Type } from 'class-transformer';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class WorkActivityQueryDto extends PaginationDto {
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class FieldLocationMapQueryDto extends WorkActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  employee_id?: number;

  @IsString()
  purpose: string;
}
