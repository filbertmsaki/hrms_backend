import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class EmployeeImportConfirmDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  preview_token: string;

  @ApiProperty({
    required: false,
    default: true,
    description: 'Import only valid rows instead of failing the entire batch.',
  })
  @IsBoolean()
  @IsOptional()
  process_valid_rows_only?: boolean;
}
