import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export const holidayImportCountries = ['TZ', 'KE', 'UG'] as const;
export type HolidayImportCountry = (typeof holidayImportCountries)[number];

export class HolidayScopeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branch_id?: number | null;
}

export class DeleteHolidayDto extends HolidayScopeDto {
  @IsOptional()
  @IsIn([...holidayImportCountries])
  import_country_code?: HolidayImportCountry;

  @IsOptional()
  @IsDateString({ strict: true })
  holiday_date?: string;
}
