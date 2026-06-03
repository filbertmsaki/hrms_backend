import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmployeeDeviceCardDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  card_no: string;

  @ApiPropertyOptional({ default: 'normalCard' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  card_type?: string;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  sync_to_device?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  user_verify_mode?: string;
}
