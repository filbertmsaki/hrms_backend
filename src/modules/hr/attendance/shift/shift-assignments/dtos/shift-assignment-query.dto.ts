import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { ShiftAssignmentStatusEnum } from '../enums/shift-assignment-status.enum';

export class ShiftAssignmentQueryDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employee_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  shift_id?: number;

  @ApiPropertyOptional({ enum: ShiftAssignmentStatusEnum })
  @IsEnum(ShiftAssignmentStatusEnum)
  @IsOptional()
  status?: ShiftAssignmentStatusEnum;
}
