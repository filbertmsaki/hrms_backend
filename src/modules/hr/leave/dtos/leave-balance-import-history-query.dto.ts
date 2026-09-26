import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import { LeaveBalanceImportBatchStatusEnum } from '../enums/leave-balance-import-batch-status.enum';

export class LeaveBalanceImportHistoryQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: LeaveBalanceImportBatchStatusEnum })
  @IsEnum(LeaveBalanceImportBatchStatusEnum)
  @IsOptional()
  status?: LeaveBalanceImportBatchStatusEnum;
}
