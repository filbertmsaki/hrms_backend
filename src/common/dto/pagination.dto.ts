import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class PaginationDto {
  @ApiPropertyOptional({ example: 1, default: 1, description: 'Page number (1-based)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, description: 'Items per page (max 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    example: 'created_at',
    description: 'Column to sort by (any valid User field)',
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'created_at';

  @ApiPropertyOptional({
    enum: SortDirection,
    example: SortDirection.DESC,
    description: 'Sort direction',
  })
  @IsOptional()
  @IsEnum(SortDirection)
  sortOrder?: SortDirection = SortDirection.DESC;

  @ApiPropertyOptional({ example: 'john', description: 'Search in name, email, phone, user_no' })
  @IsOptional()
  @IsString()
  search?: string;
}