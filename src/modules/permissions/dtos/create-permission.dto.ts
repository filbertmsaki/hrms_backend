import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
      'Marks the permission as system-generated and protected from non-owner mutations',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  is_system_generated?: boolean;
}
