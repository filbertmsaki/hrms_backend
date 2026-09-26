import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches } from 'class-validator';

export class LeaveBalanceImportTemplateQueryDto {
  @ApiPropertyOptional({
    example: '2026',
    description: 'Leave year to export. Defaults to the current leave year.',
  })
  @Matches(/^\d{4}$/)
  @IsString()
  @IsOptional()
  fiscal_year?: string;

  @ApiPropertyOptional({ description: 'Limit the template to one branch.' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional({ description: 'Limit the template to one department.' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  department_id?: number;

  @ApiPropertyOptional({ description: 'Limit the template to one leave type.' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  leave_type_id?: number;
}
