import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { EmployeeImportActivationModeEnum } from '../enums/employee-import-activation-mode.enum';
import { EmployeeImportModeEnum } from '../enums/employee-import-mode.enum';
import { EmployeeImportNumberModeEnum } from '../enums/employee-import-number-mode.enum';

export class EmployeeImportPreviewRequestDto {
  @ApiPropertyOptional({ enum: EmployeeImportModeEnum })
  @IsEnum(EmployeeImportModeEnum)
  @IsOptional()
  import_mode?: EmployeeImportModeEnum;

  @ApiPropertyOptional({ enum: EmployeeImportNumberModeEnum })
  @IsEnum(EmployeeImportNumberModeEnum)
  @IsOptional()
  employee_number_mode?: EmployeeImportNumberModeEnum;

  @ApiPropertyOptional({ enum: EmployeeImportActivationModeEnum })
  @IsEnum(EmployeeImportActivationModeEnum)
  @IsOptional()
  activation_mode?: EmployeeImportActivationModeEnum;

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

  @IsString()
  @MaxLength(500)
  @IsOptional()
  import_reason?: string;
}
