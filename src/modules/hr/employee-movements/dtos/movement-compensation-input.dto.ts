import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class MovementSalaryComponentOverrideDto {
  @IsString()
  @MaxLength(80)
  component_code: string;

  @IsNumberString()
  @IsOptional()
  amount?: string;

  @IsNumberString()
  @IsOptional()
  rate?: string;

  @IsBoolean()
  @IsOptional()
  excluded?: boolean;
}

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

  /**
   * Replaces the employee's structure overrides when sent (an empty list or
   * null clears them). When omitted, current overrides carry over for every
   * component that also exists in the target structure; on a movement edit,
   * omitting it keeps the overrides already saved on the movement.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MovementSalaryComponentOverrideDto)
  @IsOptional()
  component_overrides?: MovementSalaryComponentOverrideDto[] | null;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  revision_reference?: string;

  @IsString()
  @MaxLength(2000)
  justification: string;
}
