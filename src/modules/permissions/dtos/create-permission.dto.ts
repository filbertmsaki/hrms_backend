import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { permissionKeyPattern } from '../../../common/utils/permission.util';
import { PermissionScope } from '../enums/permission-scope.enum';

export class CreatePermissionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(permissionKeyPattern, {
    message: 'Use a lowercase module:action permission key.',
  })
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
