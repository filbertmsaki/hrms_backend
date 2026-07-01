import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class AddCompanyUserDto {
  @ApiProperty({ example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  user_id: number;

  @ApiPropertyOptional({ example: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_default?: boolean;

  @ApiPropertyOptional({ example: [1, 2] })
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  role_ids?: number[];

  @ApiPropertyOptional({ example: ['COMPANY_ADMIN'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  role_names?: string[];
}
