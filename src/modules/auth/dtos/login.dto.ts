import { Type } from 'class-transformer';
import { ApiHideProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Min,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiHideProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  company_id?: number;
}
