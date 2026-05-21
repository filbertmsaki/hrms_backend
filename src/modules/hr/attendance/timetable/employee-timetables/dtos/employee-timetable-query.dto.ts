import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { EmployeeTimetableStatusEnum } from '../enums/employee-timetable-status.enum';

export class EmployeeTimetableQueryDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employee_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  timetable_id?: number;

  @ApiPropertyOptional({ enum: EmployeeTimetableStatusEnum })
  @IsEnum(EmployeeTimetableStatusEnum)
  @IsOptional()
  status?: EmployeeTimetableStatusEnum;
}
