import {
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class MovementCompensationInputDto {
  @IsNumberString()
  base_salary: string;

  @IsString()
  @Length(3, 3)
  currency: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  salary_structure_code?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  revision_reference?: string;

  @IsString()
  @MaxLength(2000)
  justification: string;
}
