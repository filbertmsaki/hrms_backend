import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { IdentificationTypeEnum } from '../enums/identification-type.enum';

export class UpdateEmployeeIdentificationDto {
  @ApiPropertyOptional({ enum: IdentificationTypeEnum })
  @IsEnum(IdentificationTypeEnum)
  @IsOptional()
  identification_type?: IdentificationTypeEnum;

  @IsString()
  @IsOptional()
  identification_number?: string;

  @IsString()
  @IsOptional()
  issued_country?: string;

  @IsDateString()
  @IsOptional()
  expiry_date?: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;
}