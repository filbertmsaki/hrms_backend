import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateEmployeeRelativeDto {
  @IsString()
  @IsOptional()
  full_name?: string;

  @IsString()
  @IsOptional()
  relationship?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  occupation?: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_emergency_contact?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;
}