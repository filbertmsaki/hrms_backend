import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateCompanyModulesDto {
  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  roles?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  permissions?: boolean;
}
