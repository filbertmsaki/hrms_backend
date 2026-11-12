import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  KpiDirection,
  KpiFrequency,
  KpiMeasurement,
  KpiSubject,
} from '../kpi.entities';

const measurements = [
  'numeric',
  'percentage',
  'currency',
  'duration',
  'binary',
  'milestone',
  'qualitative',
] as const;
const directions = [
  'higher',
  'lower',
  'exact',
  'range',
  'not_applicable',
] as const;
const frequencies = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;

export class DefinitionDto {
  @IsString() @IsNotEmpty() @MaxLength(80) code: string;
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @IsOptional() @IsString() description?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) category: string;
  @IsOptional() @IsString() strategicObjective?: string;
  @IsIn(measurements) measurementType: KpiMeasurement;
  @IsOptional() @IsString() @MaxLength(60) measurementUnit?: string;
  @IsIn(directions) direction: KpiDirection;
  @IsIn(frequencies) frequency: KpiFrequency;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) ownerEmployeeId?: number;
}

export class TemplateDto extends DefinitionDto {
  @IsOptional() @IsString() @MaxLength(100) departmentClassification?: string;
}

export class PeriodDto {
  @IsIn(frequencies) frequency: KpiFrequency;
  @IsString() @IsNotEmpty() @MaxLength(100) label: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
}

export class AssignmentDto {
  @Type(() => Number) @IsInt() @Min(1) definitionId: number;
  @Type(() => Number) @IsInt() @Min(1) periodId: number;
  @IsIn(['employee', 'department', 'branch', 'manager_group'])
  subjectType: KpiSubject;
  @Type(() => Number) @IsInt() @Min(1) subjectId: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) managerEmployeeId?: number;
  @IsObject() target: Record<string, unknown>;
}

export class TargetRevisionDto {
  @IsObject() target: Record<string, unknown>;
  @IsString() @IsNotEmpty() reason: string;
}

export class AssignmentUpdateDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) managerEmployeeId?: number;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
}
