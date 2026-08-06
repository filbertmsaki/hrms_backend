import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DailyActivityReviewDecisionEnum,
  DailyActivitySourceEnum,
  DailyActivityStatusEnum,
  FieldPartyTypeEnum,
} from '../enums/work-activity.enums';

export class CreateActivityCategoryDto {
  @IsString()
  @MaxLength(80)
  code: string;

  @IsString()
  @MaxLength(180)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  department_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  position_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  grade_id?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requires_time?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requires_outcome?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requires_evidence?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requires_location?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is_field_activity?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  default_kpi_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  display_order?: number;
}

export class UpdateActivityCategoryDto extends PartialType(
  CreateActivityCategoryDto,
) {}

export class CreateActivityPolicyDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branch_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  department_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  position_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  grade_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  employment_type?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  daily_submission_required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  submission_cutoff_time?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  manager_review_required?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minimum_activity_count?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minimum_completed_activity_count?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  field_visit_plan_required?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allow_unplanned_visits?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  require_visit_selfie?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  require_device_binding?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maximum_backdate_days?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @IsDateString()
  effective_from: string;

  @IsOptional()
  @IsDateString()
  effective_to?: string;
}

export class UpdateActivityPolicyDto extends PartialType(
  CreateActivityPolicyDto,
) {}

export class CreateDailyActivityReportDto {
  @IsDateString()
  activity_date: string;

  @IsOptional()
  @IsUUID()
  client_request_id?: string;

  @IsOptional()
  @IsEnum(DailyActivitySourceEnum)
  source?: DailyActivitySourceEnum;
}

export class CreateDailyActivityEntryDto {
  @Type(() => Number)
  @IsInt()
  activity_category_id: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  kpi_definition_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  project_reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  task_reference?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  field_party_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  external_reference_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  external_reference_id?: string;

  @IsString()
  @MaxLength(250)
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsDateString()
  planned_start_time?: string;

  @IsOptional()
  @IsDateString()
  planned_end_time?: string;

  @IsOptional()
  @IsDateString()
  actual_start_time?: string;

  @IsOptional()
  @IsDateString()
  actual_end_time?: string;

  @IsOptional()
  @IsEnum(DailyActivityStatusEnum)
  status?: DailyActivityStatusEnum;

  @IsOptional()
  @IsString()
  outcome?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  defer_reason?: string;

  @IsOptional()
  @IsDateString()
  follow_up_date?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  completion_percentage?: number;

  @IsOptional()
  @IsUUID()
  client_request_id?: string;
}

export class UpdateDailyActivityEntryDto extends PartialType(
  CreateDailyActivityEntryDto,
) {}

export class AddDailyActivityEvidenceDto {
  @Type(() => Number)
  @IsInt()
  document_id: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class SubmitDailyActivityReportDto {
  @IsString()
  @MaxLength(5000)
  employee_summary: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  overall_remarks?: string;

  @IsUUID()
  client_request_id: string;
}

export class DailyActivityEntryReviewDto {
  @Type(() => Number)
  @IsInt()
  entry_id: number;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  manager_comment?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  manager_validated?: boolean;
}

export class ReviewDailyActivityReportDto {
  @IsEnum(DailyActivityReviewDecisionEnum)
  decision: DailyActivityReviewDecisionEnum;

  @IsString()
  @MaxLength(5000)
  comments: string;

  @IsOptional()
  @IsNumberString()
  rating?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyActivityEntryReviewDto)
  entry_reviews?: DailyActivityEntryReviewDto[];
}

export class CreateFieldPartyDto {
  @IsEnum(FieldPartyTypeEnum)
  party_type: FieldPartyTypeEnum;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  contact_person?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  location_radius_meters?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source_system?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  external_reference?: string;

  @IsOptional()
  @IsObject()
  external_snapshot?: Record<string, unknown>;
}

export class UpdateFieldPartyDto extends PartialType(CreateFieldPartyDto) {}
