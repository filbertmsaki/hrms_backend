import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class EmployeeExperienceInputDto {
  @IsString()
  @IsNotEmpty()
  company_name: string;

  @IsString()
  @IsNotEmpty()
  job_title: string;

  @IsString()
  @IsNotEmpty()
  responsibilities_description: string;

  @IsDateString()
  start_date: string;

  @ValidateIf((object: EmployeeExperienceInputDto) => !object.currently_working)
  @IsDateString()
  end_date?: string;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  currently_working?: boolean;
}
