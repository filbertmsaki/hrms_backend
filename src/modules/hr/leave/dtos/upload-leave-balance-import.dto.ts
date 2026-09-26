import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadLeaveBalanceImportDto {
  @ApiPropertyOptional({
    description:
      'Reason applied to changed rows whose Adjustment Reason / Remarks cell is blank.',
    maxLength: 500,
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  default_reason?: string;
}
