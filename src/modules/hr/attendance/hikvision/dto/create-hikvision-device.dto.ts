import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsIP,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateHikvisionDeviceDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsIP()
  ip_address: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  port?: number;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  protocol?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number | null;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
