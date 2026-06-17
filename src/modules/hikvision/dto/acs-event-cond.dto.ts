import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

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

  @ApiPropertyOptional({ example: 10, default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  maxResults?: number = 10;

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

  @ApiPropertyOptional({ example: 'attendance', default: 'attendance' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  eventAttribute?: string = 'attendance';

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
