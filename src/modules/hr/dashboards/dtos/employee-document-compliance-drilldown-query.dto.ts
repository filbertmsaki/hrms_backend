import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DashboardQueryDto } from './dashboard-query.dto';

export class EmployeeDocumentComplianceDrilldownQueryDto extends DashboardQueryDto {
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @IsIn(['COMPLIANT', 'MISSING', 'EXPIRED', 'UNVERIFIED'])
  state: 'COMPLIANT' | 'MISSING' | 'EXPIRED' | 'UNVERIFIED';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;
}
