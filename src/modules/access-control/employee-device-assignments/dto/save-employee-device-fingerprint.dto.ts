import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class SaveEmployeeDeviceFingerprintDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  fingerprint_id: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  finger_data: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  finger_no?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  finger_print_quality: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  min_quality?: number;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  overwrite?: boolean;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  sync_to_device?: boolean;

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
