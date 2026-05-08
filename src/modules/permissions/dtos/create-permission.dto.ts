import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  display_name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description:
      'Company scope for the permission. Omit for company users; owners can create global or company-scoped permissions.',
    type: Number,
  })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  company_id?: number;

  @ApiPropertyOptional({
    description:
      'Marks the permission as system-generated and protected from non-owner mutations',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  is_system_generated?: boolean;
}
