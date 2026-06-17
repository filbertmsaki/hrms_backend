import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class CaptureEmployeeDeviceFingerprintDto {
  @ApiProperty({
    description: 'Fingerprint slot number to capture from the device',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  finger_no: number;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  sync_to_device?: boolean;
}
