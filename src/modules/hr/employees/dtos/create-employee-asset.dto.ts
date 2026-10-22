import {
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateEmployeeAssetDto {
  @IsString()
  @MaxLength(40)
  asset_type: string;

  @IsString()
  @MaxLength(180)
  asset_label: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  asset_identifier?: string;

  @IsOptional()
  @IsDateString()
  issued_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  condition_at_issue?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
