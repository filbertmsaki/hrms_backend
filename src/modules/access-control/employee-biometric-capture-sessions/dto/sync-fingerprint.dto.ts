import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SyncFingerprintDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  device_id: number;

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
