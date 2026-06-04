import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class StartFingerprintCaptureDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  device_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  finger_no: number;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  sync_to_device?: boolean;
}
