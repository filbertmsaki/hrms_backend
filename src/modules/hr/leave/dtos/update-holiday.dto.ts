import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateHolidayDto } from './create-holiday.dto';

export class UpdateHolidayDto extends PartialType(
  OmitType(CreateHolidayDto, ['import_country_code'] as const),
) {}
