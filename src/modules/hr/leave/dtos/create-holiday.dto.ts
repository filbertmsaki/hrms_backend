import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsIn,
  Matches,
  IsString,
  MaxLength,
} from 'class-validator';

import {
  HolidayScopeDto,
  holidayImportCountries,
  type HolidayImportCountry,
} from './holiday-scope.dto';

export class CreateHolidayDto extends HolidayScopeDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  name: string;

  @IsDateString()
  holiday_date: string;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_recurring?: boolean;

  @IsOptional()
  @IsIn([...holidayImportCountries])
  import_country_code?: HolidayImportCountry;
}
