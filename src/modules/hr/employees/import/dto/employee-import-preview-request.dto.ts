import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { EmployeeImportModeEnum } from '../enums/employee-import-mode.enum';

export class EmployeeImportPreviewRequestDto {
  @ApiPropertyOptional({ enum: EmployeeImportModeEnum })
  @IsEnum(EmployeeImportModeEnum)
  @IsOptional()
  import_mode?: EmployeeImportModeEnum;

  @ApiPropertyOptional({
    description:
      'When true, valid rows may still be imported even if others fail.',
    default: true,
  })
  @Transform(({ value }: { value: unknown }): boolean | undefined => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return value.toLowerCase() !== 'false';
    }

    return undefined;
  })
  @IsBoolean()
  @IsOptional()
  process_valid_rows_only?: boolean;
}
