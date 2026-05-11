import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ContactTypeEnum } from '../enums/contact-type.enum';

export class CreateEmployeeContactDto {
  @ApiPropertyOptional({ enum: ContactTypeEnum, default: ContactTypeEnum.PERSONAL })
  @IsEnum(ContactTypeEnum)
  contact_type: ContactTypeEnum;

  @IsString()
  @IsOptional()
  phone_number?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_verified?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}