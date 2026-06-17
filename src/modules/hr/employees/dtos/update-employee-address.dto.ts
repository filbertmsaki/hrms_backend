import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { AddressTypeEnum } from '../enums/address-type.enum';

export class UpdateEmployeeAddressDto {
  @IsString()
  @IsOptional()
  address_line_1?: string;

  @IsString()
  @IsOptional()
  address_line_2?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  postal_code?: string;

  @ApiPropertyOptional({ enum: AddressTypeEnum })
  @IsEnum(AddressTypeEnum)
  @IsOptional()
  address_type?: AddressTypeEnum;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;
}
