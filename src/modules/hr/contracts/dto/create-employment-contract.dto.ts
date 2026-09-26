import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EmploymentContractType } from '../entities/employment-contract.entity';

export class CreateEmploymentContractDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id: number;

  @IsEnum(EmploymentContractType)
  contract_type: EmploymentContractType;

  @IsDateString()
  start_date: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @Type(() => Number)
  @IsInt()
  @Min(18)
  employee_age: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  permanent_address: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  place_of_recruitment: string;

  @IsString()
  @IsNotEmpty()
  job_description: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  place_of_work: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  hours_of_work: string;

  @IsString()
  @IsNotEmpty()
  remuneration: string;

  @IsString()
  @IsNotEmpty()
  remuneration_method: string;

  @IsString()
  @IsNotEmpty()
  benefits: string;
}
