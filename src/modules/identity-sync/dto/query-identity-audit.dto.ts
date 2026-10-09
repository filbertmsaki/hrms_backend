import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  IDENTITY_FIELDS,
  IdentityChangeSource,
} from '../entities/identity-change-audit.entity';
import type { IdentityField } from '../entities/identity-change-audit.entity';

export class QueryIdentityAuditDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 25;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  user_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employee_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  actor_user_id?: number;

  @IsOptional()
  @IsIn(IDENTITY_FIELDS as IdentityField[])
  field?: IdentityField;

  @IsOptional()
  @IsIn(Object.values(IdentityChangeSource))
  source?: IdentityChangeSource;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
