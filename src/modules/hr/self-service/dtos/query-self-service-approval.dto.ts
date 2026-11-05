import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';
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

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  department_id?: number;

  @ApiPropertyOptional({
    example: 12,
    description:
      'Employee id of a manager; matches requests from their direct reports or departments they manage.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  manager_employee_id?: number;

  @ApiPropertyOptional({
    enum: [...Object.values(SelfServiceRequestStatusEnum), 'all'],
    description:
      'Omit to list requests awaiting your decision; `all` lists every status.',
  })
  @IsOptional()
  @IsIn([...Object.values(SelfServiceRequestStatusEnum), 'all'])
  status?: SelfServiceRequestStatusEnum | 'all';

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  from_date?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  to_date?: string;
}
