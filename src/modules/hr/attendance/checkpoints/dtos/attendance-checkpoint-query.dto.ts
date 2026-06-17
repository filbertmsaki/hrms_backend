import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { AttendanceCheckpointStatusEnum } from '../enums/attendance-checkpoint-status.enum';
import { AttendanceCheckpointTypeEnum } from '../enums/attendance-checkpoint-type.enum';

export class AttendanceCheckpointQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  policy_set_id?: number;

  @ApiPropertyOptional({ enum: AttendanceCheckpointTypeEnum })
  @IsEnum(AttendanceCheckpointTypeEnum)
  @IsOptional()
  type?: AttendanceCheckpointTypeEnum;

  @ApiPropertyOptional({ enum: AttendanceCheckpointStatusEnum })
  @IsEnum(AttendanceCheckpointStatusEnum)
  @IsOptional()
  status?: AttendanceCheckpointStatusEnum;
}
