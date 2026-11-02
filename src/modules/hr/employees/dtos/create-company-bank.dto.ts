import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateCompanyBankDto {
  @IsString()
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  logo_url?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
