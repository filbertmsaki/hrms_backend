import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  FieldOpportunityStatusEnum,
  FieldOpportunityTypeEnum,
  FieldVisitEvidenceTypeEnum,
  FieldVisitExpenseTypeEnum,
  FieldVisitReviewDecisionEnum,
  FieldVisitTypeEnum,
} from '../enums/work-activity.enums';

export class CreateFieldVisitPlanItemDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  field_party_id?: number;

  @IsEnum(FieldVisitTypeEnum)
  visit_type: FieldVisitTypeEnum;

  @IsOptional()
  @IsDateString()
  planned_start_time?: string;

  @IsOptional()
  @IsDateString()
  planned_end_time?: string;

  @IsString()
  purpose: string;

  @IsOptional()
  @IsString()
  expected_outcome?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  latitude?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  longitude?: number;

  @IsOptional()
  @IsString()
  planned_address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  display_order?: number;

  @IsOptional()
  @IsUUID()
  client_request_id?: string;
}

export class CreateFieldVisitPlanDto {
  @IsDateString()
  visit_date: string;

  @IsOptional()
  @IsString()
  plan_summary?: string;

  @IsOptional()
  @IsUUID()
  client_request_id?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFieldVisitPlanItemDto)
  items: CreateFieldVisitPlanItemDto[];
}

export class UpdateFieldVisitPlanDto extends PartialType(
  CreateFieldVisitPlanDto,
) {}

export class SubmitFieldVisitPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  plan_summary?: string;
}

export class CreateUnplannedFieldVisitDto {
  @IsDateString()
  visit_date: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  field_party_id?: number;

  @IsEnum(FieldVisitTypeEnum)
  visit_type: FieldVisitTypeEnum;

  @IsString()
  purpose: string;

  @IsString()
  unplanned_reason: string;

  @IsOptional()
  @IsUUID()
  client_request_id?: string;
}

export class FieldVisitCheckInDto {
  @IsUUID()
  client_request_id: string;

  @IsDateString()
  captured_at: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy_meters?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  device_identifier?: string;

  @IsOptional()
  device_info?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  selfie_document_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  attendance_mobile_punch_id?: number;
}

export class CreateFieldOpportunityDto {
  @IsOptional()
  @IsUUID()
  client_request_id?: string;

  @IsEnum(FieldOpportunityTypeEnum)
  opportunity_type: FieldOpportunityTypeEnum;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  potential_value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  premium_value?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  premium_currency?: string;

  @IsOptional()
  @IsDateString()
  expected_close_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source_system?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  external_reference?: string;
}

export class UpdateFieldOpportunityCommercialDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actual_value?: number;

  @IsOptional()
  @IsEnum(FieldOpportunityStatusEnum)
  status?: FieldOpportunityStatusEnum;

  @IsString()
  @MaxLength(1000)
  reason: string;
}

export class UpsertFieldVisitCommercialPolicyDto {
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  default_currency: string;

  @IsArray()
  @IsString({ each: true })
  @Matches(/^[A-Za-z]{3}$/, { each: true })
  supported_currencies: string[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allow_employee_opportunity_values?: boolean;
}

export class CreateFieldVisitExpenseDto {
  @IsEnum(FieldVisitExpenseTypeEnum)
  expense_type: FieldVisitExpenseTypeEnum;

  @IsNumber()
  amount: number;

  @IsString()
  @MaxLength(3)
  currency: string;

  @IsString()
  description: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  receipt_document_id?: number;
}

export class FieldVisitCheckOutDto extends FieldVisitCheckInDto {
  @IsString()
  @MaxLength(10000)
  discussion_notes: string;

  @IsString()
  @MaxLength(5000)
  outcome: string;

  @Type(() => Boolean)
  @IsBoolean()
  follow_up_required: boolean;

  @IsOptional()
  @IsDateString()
  next_follow_up_date?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFieldOpportunityDto)
  opportunities?: CreateFieldOpportunityDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFieldVisitExpenseDto)
  expenses?: CreateFieldVisitExpenseDto[];
}

export class AddFieldVisitEvidenceDto {
  @IsEnum(FieldVisitEvidenceTypeEnum)
  evidence_type: FieldVisitEvidenceTypeEnum;

  @Type(() => Number)
  @IsInt()
  document_id: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  captured_at?: string;

  @IsOptional()
  @IsUUID()
  client_request_id?: string;
}

export class FieldOpportunityValidationDto {
  @Type(() => Number)
  @IsInt()
  opportunity_id: number;

  @Type(() => Boolean)
  @IsBoolean()
  validated: boolean;
}

export class ReviewFieldVisitDto {
  @IsEnum(FieldVisitReviewDecisionEnum)
  decision: FieldVisitReviewDecisionEnum;

  @IsString()
  @MaxLength(5000)
  comments: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  validate_opportunities?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldOpportunityValidationDto)
  opportunity_validations?: FieldOpportunityValidationDto[];

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  approved_expense_ids?: number[];
}

export class CompleteFieldFollowUpDto {
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  completion_note?: string;
}

export class CreateFieldFollowUpDto {
  @Type(() => Number)
  @IsInt()
  field_visit_id: number;

  @IsDateString()
  due_date: string;

  @IsString()
  @MaxLength(500)
  action: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  field_opportunity_id?: number;
}

export class UpdateFieldFollowUpDto {
  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  action?: string;
}
