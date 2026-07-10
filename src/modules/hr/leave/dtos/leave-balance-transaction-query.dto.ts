import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import { LeaveBalanceTransactionTypeEnum } from '../enums/leave-balance-transaction-type.enum';

export class LeaveBalanceTransactionQueryDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  employee_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  leave_type_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  leave_request_id?: number;

  @Matches(/^\d{4}$/)
  @IsString()
  @IsOptional()
  fiscal_year?: string;

  @IsEnum(LeaveBalanceTransactionTypeEnum)
  @IsOptional()
  transaction_type?: LeaveBalanceTransactionTypeEnum;
}
