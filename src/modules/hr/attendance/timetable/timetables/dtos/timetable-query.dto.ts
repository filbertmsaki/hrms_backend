import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { TimetableStatusEnum } from '../enums/timetable-status.enum';
import { TimetableTypeEnum } from '../enums/timetable-type.enum';

export class TimetableQueryDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional({ enum: TimetableTypeEnum })
  @IsEnum(TimetableTypeEnum)
  @IsOptional()
  timetable_type?: TimetableTypeEnum;

  @ApiPropertyOptional({ enum: TimetableStatusEnum })
  @IsEnum(TimetableStatusEnum)
  @IsOptional()
  status?: TimetableStatusEnum;
}
