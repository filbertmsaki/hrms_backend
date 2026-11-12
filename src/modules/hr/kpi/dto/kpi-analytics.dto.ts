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

export class KpiAnalyticsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) periodId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) cycleId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) definitionId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) employeeId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) managerId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) companyId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) departmentId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) branchId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @IsIn(['department', 'branch']) comparisonType?:
    | 'department'
    | 'branch';
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(80) search?: string;
  @IsOptional()
  @IsIn(['employee', 'department', 'branch', 'manager_group', 'organization'])
  scorecardType?:
    | 'employee'
    | 'department'
    | 'branch'
    | 'manager_group'
    | 'organization';
  @IsOptional()
  @IsIn([
    'self_draft',
    'self_submitted',
    'self_returned',
    'manager_draft',
    'manager_submitted',
    'hr_reviewed',
    'approved',
    'finalized',
    'cancelled',
  ])
  evaluationStatus?:
    | 'self_draft'
    | 'self_submitted'
    | 'self_returned'
    | 'manager_draft'
    | 'manager_submitted'
    | 'hr_reviewed'
    | 'approved'
    | 'finalized'
    | 'cancelled';
  @IsOptional()
  @IsIn(['on_track', 'at_risk', 'behind_target'])
  performanceStatus?: 'on_track' | 'at_risk' | 'behind_target';
  @IsOptional()
  @IsIn(['approved', 'pending', 'missing', 'draft', 'returned', 'rejected'])
  approvalStatus?:
    | 'approved'
    | 'pending'
    | 'missing'
    | 'draft'
    | 'returned'
    | 'rejected';
}
