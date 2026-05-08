import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateRoleDto {
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
      'Company scope for the role. Omit for company users; owners can create global or company-scoped roles.',
    type: Number,
  })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  company_id?: number;

  @ApiPropertyOptional({
    description:
      'Marks the role as system-generated and protected from non-owner mutations',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  is_system_generated?: boolean;

  @ApiPropertyOptional({
    description:
      'Permission IDs to attach to the role. Must be global or from the same company scope as the role.',
    type: [Number],
  })
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @ArrayUnique()
  @IsOptional()
  permission_ids?: number[];
}
