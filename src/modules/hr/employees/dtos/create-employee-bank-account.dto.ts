import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateEmployeeBankAccountDto {
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
  swift_code?: string;

  @IsString()
  @IsOptional()
  mobile_money_provider?: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;
}
