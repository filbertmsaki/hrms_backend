import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PermissionScope } from '../enums/permission-scope.enum';

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
    enum: PermissionScope,
    default: PermissionScope.COMPANY,
  })
  @IsEnum(PermissionScope)
  @IsOptional()
  scope?: PermissionScope;
}
