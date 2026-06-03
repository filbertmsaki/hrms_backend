import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SyncEmployeeDeviceFingerprintDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  card_reader_no?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  user_verify_mode?: string;
}
