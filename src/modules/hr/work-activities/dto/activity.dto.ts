import { OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  MinLength,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  DailyActivityReviewDecisionEnum,
  DailyActivityPriorityEnum,
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
  @Min(1)
  department_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  position_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
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
  @Min(0)
  display_order?: number;
}

export class UpdateActivityCategoryDto extends PartialType(
  CreateActivityCategoryDto,
) {}

export class CreateActivityPolicyDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branch_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  department_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  position_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
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
  @Min(0)
  minimum_activity_count?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
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
  @Min(0)
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

export class ActivityChecklistItemDto {
  @IsString()
  @MaxLength(80)
  @MinLength(1)
  id: string;

  @IsString()
  @MaxLength(250)
  @MinLength(1)
  title: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  completed?: boolean;
}

export class CreateManagerActivityTaskDto {
  @ValidateIf(
    (dto: CreateManagerActivityTaskDto) =>
      !Array.isArray(dto.employee_ids) || dto.employee_ids.length === 0,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Type(() => Number)
  employee_ids?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activity_category_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_kpi_id?: number;

  @IsDateString()
  activity_date: string;

  @IsString()
  @MaxLength(250)
  @MinLength(1)
  title: string;

  @IsString()
  @MaxLength(4000)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  expected_result?: string;

  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsDateString()
  planned_start_time?: string;

  @IsOptional()
  @IsDateString()
  planned_end_time?: string;

  @IsOptional()
  @IsEnum(DailyActivityPriorityEnum)
  priority?: DailyActivityPriorityEnum;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique((item: unknown) =>
    item !== null && typeof item === 'object' && 'id' in item
      ? item.id
      : undefined,
  )
  @ValidateNested({ each: true })
  @Type(() => ActivityChecklistItemDto)
  checklist?: ActivityChecklistItemDto[];
}

export class CreateSelfActivityTaskDto extends OmitType(
  CreateManagerActivityTaskDto,
  ['employee_id', 'employee_ids'] as const,
) {}

export class CreateDailyActivityEntryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activity_category_id: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  kpi_definition_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_kpi_id?: number;

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
  @Min(1)
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
  @MinLength(1)
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  expected_result?: string;

  @IsOptional()
  @IsDateString()
  due_date?: string;

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

  @IsOptional()
  @IsEnum(DailyActivityPriorityEnum)
  priority?: DailyActivityPriorityEnum;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique((item: unknown) =>
    item !== null && typeof item === 'object' && 'id' in item
      ? item.id
      : undefined,
  )
  @ValidateNested({ each: true })
  @Type(() => ActivityChecklistItemDto)
  checklist?: ActivityChecklistItemDto[];
}

export class UpdateDailyActivityEntryDto extends PartialType(
  CreateDailyActivityEntryDto,
) {}

export class AddDailyActivityEvidenceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  document_id: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class SubmitDailyActivityReportDto {
  @IsString()
  @MaxLength(5000)
  @MinLength(1)
  employee_summary: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  overall_remarks?: string;

  @IsUUID()
  client_request_id: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  entry_ids?: number[];
}

export class DailyActivityEntryReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
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

export class CreateDailyActivityCommentDto {
  @IsString()
  @MaxLength(3000)
  body: string;
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
  @Min(0)
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
