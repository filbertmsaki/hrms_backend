import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export enum EmployeeImportExecutionModeEnum {
  NORMAL = 'NORMAL',
  SYNC = 'SYNC',
}

export class EmployeeImportConfirmDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  batch_id?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  preview_token?: string;

  @ApiPropertyOptional({
    type: [Number],
    description:
      'Validated employee import row IDs selected for import confirmation.',
  })
  @Type(() => Number)
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  row_ids?: number[];

  @ApiPropertyOptional({
    type: [Number],
    description: 'Validated row IDs explicitly excluded by the user.',
  })
  @Type(() => Number)
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  excluded_row_ids?: number[];

  @ApiPropertyOptional({
    default: true,
    description:
      'Explicit acknowledgement that existing records were reviewed and will be skipped when not selected for import.',
  })
  @IsBoolean()
  @IsOptional()
  skip_existing_records?: boolean;

  @ApiPropertyOptional({
    default: true,
    description:
      'Explicit acknowledgement that invalid and duplicate rows were reviewed and excluded from import.',
  })
  @IsBoolean()
  @IsOptional()
  exclude_invalid_records?: boolean;

  @ApiProperty({
    required: false,
    default: true,
    description: 'Import only valid rows instead of failing the entire batch.',
  })
  @IsBoolean()
  @IsOptional()
  process_valid_rows_only?: boolean;

  @ApiPropertyOptional({
    enum: EmployeeImportExecutionModeEnum,
    default: EmployeeImportExecutionModeEnum.NORMAL,
    description:
      'Execution mode for the confirmed import. NORMAL queues the batch; SYNC processes it in the request.',
  })
  @IsEnum(EmployeeImportExecutionModeEnum)
  @IsOptional()
  execution_mode?: EmployeeImportExecutionModeEnum;
}
