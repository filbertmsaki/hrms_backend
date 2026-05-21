import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationDto } from '../../../../../../common/dto/pagination.dto';
import { ShiftChangeRequestStatusEnum } from '../enums/shift-change-request-status.enum';

export class ShiftChangeRequestQueryDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employee_id?: number;

  @ApiPropertyOptional({ enum: ShiftChangeRequestStatusEnum })
  @IsEnum(ShiftChangeRequestStatusEnum)
  @IsOptional()
  status?: ShiftChangeRequestStatusEnum;

  @IsDateString()
  @IsOptional()
  from_date?: string;

  @IsDateString()
  @IsOptional()
  to_date?: string;
}
