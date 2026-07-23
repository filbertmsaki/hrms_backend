import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class AssignOffboardingClearanceDto {
  @Type(() => Number)
  @IsInt()
  owner_company_user_id: number;

  @IsDateString()
  @IsOptional()
  due_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}
