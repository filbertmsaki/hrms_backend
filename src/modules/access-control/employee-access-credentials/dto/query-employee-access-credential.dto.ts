import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { EmployeeAccessCredentialStatusEnum } from '../enum/employee-access-credential-status.enum';
import { EmployeeAccessCredentialTypeEnum } from '../enum/employee-access-credential-type.enum';

export enum CredentialSortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class QueryEmployeeAccessCredentialDto {
  @ApiPropertyOptional({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({ example: 39 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employee_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  device_id?: number;

  @ApiPropertyOptional({
    enum: EmployeeAccessCredentialTypeEnum,
    example: EmployeeAccessCredentialTypeEnum.FINGERPRINT,
  })
  @IsEnum(EmployeeAccessCredentialTypeEnum)
  @IsOptional()
  credential_type?: EmployeeAccessCredentialTypeEnum;

  @ApiPropertyOptional({
    enum: EmployeeAccessCredentialStatusEnum,
    example: EmployeeAccessCredentialStatusEnum.ACTIVE,
  })
  @IsEnum(EmployeeAccessCredentialStatusEnum)
  @IsOptional()
  credential_status?: EmployeeAccessCredentialStatusEnum;

  @ApiPropertyOptional({ example: '00000023' })
  @IsString()
  @IsOptional()
  employee_no?: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsString()
  @IsOptional()
  card_no?: string;

  @ApiPropertyOptional({ example: '1' })
  @IsString()
  @IsOptional()
  fingerprint_id?: string;

  @ApiPropertyOptional({ example: 'search value' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    enum: CredentialSortDirection,
    example: CredentialSortDirection.DESC,
  })
  @IsEnum(CredentialSortDirection)
  @IsOptional()
  sort_order?: CredentialSortDirection = CredentialSortDirection.DESC;
}
