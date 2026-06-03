import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SaveCapturedFingerprintDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  device_id: number;

  @IsString()
  @MaxLength(100)
  fingerprint_id: string;

  @IsString()
  @IsNotEmpty()
  finger_data: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  finger_no?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  finger_print_quality: number;

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

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  card_reader_no?: number;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  user_verify_mode?: string;
}
