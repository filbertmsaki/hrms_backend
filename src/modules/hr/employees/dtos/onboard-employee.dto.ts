import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { CreateEmployeeDto } from './create-employee.dto';

export class OnboardEmployeeDto extends CreateEmployeeDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @MinLength(6)
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsOptional()
  user_status?: string;

  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @ArrayUnique()
  @IsOptional()
  role_ids?: number[];
}
