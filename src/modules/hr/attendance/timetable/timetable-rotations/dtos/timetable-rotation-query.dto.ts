import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationDto } from '../../../../../../common/dto/pagination.dto';
import { TimetableRotationStatusEnum } from '../enums/timetable-rotation-status.enum';

export class TimetableRotationQueryDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  timetable_id?: number;

  @ApiPropertyOptional({ enum: TimetableRotationStatusEnum })
  @IsEnum(TimetableRotationStatusEnum)
  @IsOptional()
  status?: TimetableRotationStatusEnum;
}
