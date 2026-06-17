import { PartialType } from '@nestjs/mapped-types';
import { CreateAccessScheduleTemplateDto } from './create-access-schedule-template.dto';

export class UpdateAccessScheduleTemplateDto extends PartialType(
  CreateAccessScheduleTemplateDto,
) {}
