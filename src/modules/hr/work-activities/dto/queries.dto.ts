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

  @IsOptional()
  @Type(() => Number)
  employee_id?: number;
}

export class FieldLocationMapQueryDto extends WorkActivityQueryDto {
  @IsString()
  purpose: string;
}
