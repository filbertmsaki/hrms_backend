import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { SelfServiceRequestStatusEnum } from '../enums/self-service-request-status.enum';

export class QuerySelfServiceApprovalDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ example: 39 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id?: number;

  @ApiPropertyOptional({ enum: SelfServiceRequestStatusEnum })
  @IsOptional()
  @IsEnum(SelfServiceRequestStatusEnum)
  status?: SelfServiceRequestStatusEnum;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  from_date?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  to_date?: string;
}
