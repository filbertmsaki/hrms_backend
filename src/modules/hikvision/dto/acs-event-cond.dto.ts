import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AcsEventCondDto {
  @ApiPropertyOptional({ example: '1' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  searchID?: string = '1';

  @ApiPropertyOptional({ example: 0, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  searchResultPosition?: number = 0;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  maxResults?: number = 100;

  @ApiPropertyOptional({ example: 5, default: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  major?: number = 5;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  minor?: number = 0;

  @ApiPropertyOptional({ example: '00000062' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  employeeNoString?: string;

  @ApiPropertyOptional({ example: '2026-05-29T00:00:00+03:00' })
  @IsDateString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({ example: '2026-05-29T23:59:59+03:00' })
  @IsDateString()
  @IsOptional()
  endTime?: string;
}
