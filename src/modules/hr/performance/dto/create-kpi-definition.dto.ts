import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { KpiDataSourceTypeEnum } from '../enums/kpi-data-source-type.enum';
import { KpiMeasurementDirectionEnum } from '../enums/kpi-measurement-direction.enum';
import { KpiScoringFormulaEnum } from '../enums/kpi-scoring-formula.enum';
import { PerformancePeriodTypeEnum } from '../enums/performance-period-type.enum';

export class CreateKpiDefinitionDto {
  @IsString()
  @MaxLength(80)
  code: string;

  @IsString()
  @MaxLength(180)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsString()
  description: string;

  @IsString()
  @MaxLength(80)
  measurement_unit: string;

  @IsEnum(KpiMeasurementDirectionEnum)
  measurement_direction: KpiMeasurementDirectionEnum;

  @IsEnum(KpiScoringFormulaEnum)
  scoring_formula: KpiScoringFormulaEnum;

  @IsOptional()
  @IsObject()
  formula_configuration?: Record<string, unknown>;

  @IsEnum(KpiDataSourceTypeEnum)
  data_source_type: KpiDataSourceTypeEnum;

  @IsOptional()
  @IsObject()
  data_source_configuration?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  default_target_value?: number;

  @IsOptional()
  @IsEnum(PerformancePeriodTypeEnum)
  frequency?: PerformancePeriodTypeEnum;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  approval_authority?: string;

  @IsOptional()
  @IsBoolean()
  manual_entry_allowed?: boolean;

  @IsOptional()
  @IsBoolean()
  evidence_required?: boolean;

  @IsOptional()
  @IsObject()
  applicability_snapshot?: Record<string, unknown>;
}
