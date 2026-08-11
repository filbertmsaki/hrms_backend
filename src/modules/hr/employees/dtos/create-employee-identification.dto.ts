import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { IdentificationTypeEnum } from '../enums/identification-type.enum';

export class CreateEmployeeIdentificationDto {
  @ApiPropertyOptional({
    enum: IdentificationTypeEnum,
    default: IdentificationTypeEnum.NATIONAL_ID,
  })
  @IsEnum(IdentificationTypeEnum)
  identification_type: IdentificationTypeEnum;

  @IsString()
  @IsNotEmpty()
  identification_number: string;

  @IsString()
  @IsOptional()
  issued_country?: string;

  @IsDateString()
  @IsOptional()
  expiry_date?: string;

  @IsDateString()
  @IsOptional()
  issue_date?: string;

  @IsString()
  @IsOptional()
  issuing_authority?: string;

  @IsString()
  @IsOptional()
  document_url?: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;
}
