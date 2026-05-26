import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { AccessScheduleTemplateStatusEnum } from '../enum/access-schedule-template-status.enum';
import { AccessScheduleTemplateTypeEnum } from '../enum/access-schedule-template-type.enum';

export class CreateAccessScheduleTemplateDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsString()
  @MaxLength(50)
  hikvision_template_no: string;

  @ApiPropertyOptional({ enum: AccessScheduleTemplateTypeEnum })
  @IsEnum(AccessScheduleTemplateTypeEnum)
  @IsOptional()
  schedule_type?: AccessScheduleTemplateTypeEnum;

  @ApiPropertyOptional({ enum: AccessScheduleTemplateStatusEnum })
  @IsEnum(AccessScheduleTemplateStatusEnum)
  @IsOptional()
  status?: AccessScheduleTemplateStatusEnum;

  @ApiPropertyOptional({ description: 'Arbitrary metadata JSON object' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
