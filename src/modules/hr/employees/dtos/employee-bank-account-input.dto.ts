import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class EmployeeBankAccountInputDto {
  @IsString()
  @IsOptional()
  bank_name?: string;

  @IsString()
  @IsOptional()
  account_name?: string;

  @IsString()
  @IsNotEmpty()
  account_number: string;

  @IsString()
  @IsOptional()
  branch_name?: string;

  @IsString()
  @IsOptional()
  bank_code?: string;

  @IsString()
  @IsOptional()
  bank_branch_code?: string;

  @IsString()
  @IsOptional()
  account_currency?: string;

  @IsString()
  @IsOptional()
  account_type?: string;

  @IsString()
  @IsOptional()
  swift_code?: string;

  @IsString()
  @IsOptional()
  mobile_money_provider?: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;

  @IsString()
  @IsOptional()
  verification_status?: string;

  @IsString()
  @IsOptional()
  effective_from?: string;

  @IsString()
  @IsOptional()
  effective_to?: string;
}
