import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { ScoringConfig } from '../scorecard-scoring';
import type { RatingBand } from '../scorecard.entities';

export class ScorecardEntryDto {
  @Type(() => Number) @IsInt() @Min(1) assignmentId: number;
  @IsString() weight: string;
  @IsOptional() @IsBoolean() required?: boolean;
}
export class ScorecardCreateDto {
  @IsString() @IsNotEmpty() @MaxLength(80) code: string;
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @IsOptional() @IsString() description?: string;
  @IsIn(['employee', 'department', 'branch', 'manager_group', 'organization'])
  subjectType:
    | 'employee'
    | 'department'
    | 'branch'
    | 'manager_group'
    | 'organization';
  @Type(() => Number) @IsInt() @Min(1) subjectId: number;
  @Type(() => Number) @IsInt() @Min(1) periodId: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) managerEmployeeId?: number;
  @IsIn(['weighted', 'strategic']) mode: 'weighted' | 'strategic';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) policyVersionId?: number;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScorecardEntryDto)
  entries: ScorecardEntryDto[];
}
export class ScorecardDraftDto {
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @IsOptional() @IsString() description?: string;
  @IsIn(['weighted', 'strategic']) mode: 'weighted' | 'strategic';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) policyVersionId?: number;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScorecardEntryDto)
  entries: ScorecardEntryDto[];
}
export class PolicyDto {
  @IsString() @IsNotEmpty() @MaxLength(80) code: string;
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @IsIn(['weighted', 'strategic']) method: 'weighted' | 'strategic';
  @IsObject() config: ScoringConfig;
  @IsArray() ratingBands: RatingBand[];
}
export class PolicyDraftDto {
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @IsIn(['weighted', 'strategic']) method: 'weighted' | 'strategic';
  @IsObject() config: ScoringConfig;
  @IsArray() ratingBands: RatingBand[];
}
export class PreviewActualDto {
  @Type(() => Number) @IsInt() @Min(1) assignmentId: number;
  @IsOptional() actual?: unknown;
  @IsOptional() @IsBoolean() notApplicable?: boolean;
}
export class PreviewDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreviewActualDto)
  examples: PreviewActualDto[];
}
export class CloneDto {
  @IsString() @IsNotEmpty() @MaxLength(80) code: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
}
export class ScorecardTemplateDto {
  @IsString() @IsNotEmpty() @MaxLength(80) code: string;
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @IsIn(['weighted', 'strategic']) mode: 'weighted' | 'strategic';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) policyVersionId?: number;
  @IsArray() items: Array<{ definitionId: number; weight: string }>;
}
export class UseScorecardTemplateDto {
  @IsString() @IsNotEmpty() @MaxLength(80) code: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsIn(['employee', 'department', 'branch', 'manager_group', 'organization'])
  subjectType:
    | 'employee'
    | 'department'
    | 'branch'
    | 'manager_group'
    | 'organization';
  @Type(() => Number) @IsInt() @Min(1) subjectId: number;
  @Type(() => Number) @IsInt() @Min(1) periodId: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) managerEmployeeId?: number;
}
