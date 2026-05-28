import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { EmployeeAccessCredentialStatusEnum } from '../enum/employee-access-credential-status.enum';
import { EmployeeAccessCredentialTypeEnum } from '../enum/employee-access-credential-type.enum';

export class CreateEmployeeAccessCredentialDto {
  @ApiPropertyOptional({ enum: EmployeeAccessCredentialTypeEnum })
  @IsEnum(EmployeeAccessCredentialTypeEnum)
  @IsOptional()
  credential_type?: EmployeeAccessCredentialTypeEnum;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  credential_no?: string | null;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  device_id?: number | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  card_no?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(50)
  @IsOptional()
  pin_password?: string | null;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  fingerprint_count?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  face_count?: number;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  has_fingerprint?: boolean;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  has_face?: boolean;

  @ApiPropertyOptional({ enum: EmployeeAccessCredentialStatusEnum })
  @IsEnum(EmployeeAccessCredentialStatusEnum)
  @IsOptional()
  credential_status?: EmployeeAccessCredentialStatusEnum;

  @ApiPropertyOptional({ description: 'Arbitrary metadata JSON object' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
