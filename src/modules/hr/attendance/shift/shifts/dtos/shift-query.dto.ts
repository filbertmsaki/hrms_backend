import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationDto } from '../../../../../../common/dto/pagination.dto';
import { ShiftStatusEnum } from '../enums/shift-status.enum';
import { ShiftTypeEnum } from '../enums/shift-type.enum';

export class ShiftQueryDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  department_id?: number;

  @ApiPropertyOptional({ enum: ShiftTypeEnum })
  @IsEnum(ShiftTypeEnum)
  @IsOptional()
  shift_type?: ShiftTypeEnum;

  @ApiPropertyOptional({ enum: ShiftStatusEnum })
  @IsEnum(ShiftStatusEnum)
  @IsOptional()
  status?: ShiftStatusEnum;
}
