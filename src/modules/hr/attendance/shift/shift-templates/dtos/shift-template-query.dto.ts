import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { ShiftTemplateStatusEnum } from '../enums/shift-template-status.enum';
import { ShiftTemplateTypeEnum } from '../enums/shift-template-type.enum';

export class ShiftTemplateQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ShiftTemplateTypeEnum })
  @IsEnum(ShiftTemplateTypeEnum)
  @IsOptional()
  template_type?: ShiftTemplateTypeEnum;

  @ApiPropertyOptional({ enum: ShiftTemplateStatusEnum })
  @IsEnum(ShiftTemplateStatusEnum)
  @IsOptional()
  status?: ShiftTemplateStatusEnum;
}
