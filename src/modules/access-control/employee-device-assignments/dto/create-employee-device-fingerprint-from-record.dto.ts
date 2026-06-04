import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmployeeDeviceFingerprintFromRecordDto {
  @ApiProperty({ description: 'Backend fingerprint record id returned after capture' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  fingerprint_id: string;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  overwrite?: boolean;
}
