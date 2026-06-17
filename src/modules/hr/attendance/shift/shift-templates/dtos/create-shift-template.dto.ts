import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ShiftTemplateStatusEnum } from '../enums/shift-template-status.enum';
import { ShiftTemplateTypeEnum } from '../enums/shift-template-type.enum';

export class CreateShiftTemplateDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsEnum(ShiftTemplateTypeEnum)
  template_type: ShiftTemplateTypeEnum;

  @IsObject()
  configuration: Record<string, unknown>;

  @ApiPropertyOptional({ enum: ShiftTemplateStatusEnum })
  @IsEnum(ShiftTemplateStatusEnum)
  @IsOptional()
  status?: ShiftTemplateStatusEnum;
}
