import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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
}

