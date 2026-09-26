import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { LeaveBalanceImportModeEnum } from '../enums/leave-balance-import-mode.enum';

export class ConfirmLeaveBalanceImportDto {
  @ApiPropertyOptional({
    enum: LeaveBalanceImportModeEnum,
    default: LeaveBalanceImportModeEnum.STRICT,
  })
  @IsEnum(LeaveBalanceImportModeEnum)
  @IsOptional()
  import_mode?: LeaveBalanceImportModeEnum;

  @ApiPropertyOptional({
    description: 'Confirms the user reviewed rows imported with warnings.',
  })
  @IsBoolean()
  @IsOptional()
  acknowledge_warnings?: boolean;

  @ApiPropertyOptional({
    description:
      'Confirms the user reviewed the invalid rows that will be skipped (valid rows only mode).',
  })
  @IsBoolean()
  @IsOptional()
  acknowledge_skipped_rows?: boolean;
}
