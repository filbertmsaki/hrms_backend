import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateHolidayDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsDateString()
  holiday_date: string;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_recurring?: boolean;
}
