import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

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
}
