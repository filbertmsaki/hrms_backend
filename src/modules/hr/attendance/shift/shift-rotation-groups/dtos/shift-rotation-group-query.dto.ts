import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { ShiftRotationGroupStatusEnum } from '../enums/shift-rotation-group-status.enum';

export class ShiftRotationGroupQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ShiftRotationGroupStatusEnum })
  @IsEnum(ShiftRotationGroupStatusEnum)
  @IsOptional()
  status?: ShiftRotationGroupStatusEnum;
}
