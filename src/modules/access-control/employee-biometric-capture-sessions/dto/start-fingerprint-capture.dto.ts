import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class StartFingerprintCaptureDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  device_id: number;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  fingerprint_id?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  card_reader_no?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  min_quality?: number;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  overwrite?: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  sync_to_device?: boolean;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  user_verify_mode?: string;
}
