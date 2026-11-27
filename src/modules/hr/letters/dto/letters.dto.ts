import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LetterStatusEnum, LetterTypeEnum } from '../letter-catalogue';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1'
    ? true
    : value === false || value === 'false' || value === '0'
      ? false
      : value;

/* ----------------------------- Templates ----------------------------- */

export class CreateLetterTemplateDto {
  @IsIn(Object.values(LetterTypeEnum))
  letter_type: LetterTypeEnum;

  @Transform(trim)
  @IsString()
  @Matches(/\S/, { message: '$property must contain text' })
  @MaxLength(160)
  name: string;

  @Transform(trim)
  @IsString()
  @Matches(/\S/, { message: '$property must contain text' })
  @MaxLength(240)
  subject: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  salutation?: string;

  @IsString()
  @Matches(/\S/, { message: '$property must contain text' })
  @MaxLength(20000)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  closing?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  signatory_id?: number | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  signatory_name?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  signatory_title?: string | null;

  @IsOptional()
  @IsBoolean()
  requires_approval?: boolean;

  @IsOptional()
  @IsBoolean()
  include_acknowledgement?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

export class UpdateLetterTemplateDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/\S/, { message: '$property must contain text' })
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/\S/, { message: '$property must contain text' })
  @MaxLength(240)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  salutation?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: '$property must contain text' })
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  closing?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  signatory_id?: number | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  signatory_name?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  signatory_title?: string | null;

  @IsOptional()
  @IsBoolean()
  requires_approval?: boolean;

  @IsOptional()
  @IsBoolean()
  include_acknowledgement?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

export class LetterTemplateQueryDto {
  @IsOptional()
  @IsIn(Object.values(LetterTypeEnum))
  letter_type?: LetterTypeEnum;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  include_inactive?: boolean;
}

export class LetterPreviewDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employee_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  candidate_id?: number;

  @IsOptional()
  @IsObject()
  extra_values?: Record<string, string>;
}

/* ------------------------------ Letters ------------------------------ */

export class CreateEmployeeLetterDto {
  @IsIn(Object.values(LetterTypeEnum))
  letter_type: LetterTypeEnum;

  @Type(() => Number)
  @IsInt()
  template_id: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employee_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  candidate_id?: number;

  @IsOptional()
  @IsObject()
  extra_values?: Record<string, string>;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/\S/, { message: '$property must contain text' })
  @MaxLength(240)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  salutation?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: '$property must contain text' })
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  closing?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  recipient_address?: string | null;
}

export class UpdateEmployeeLetterDto {
  @IsOptional()
  @IsObject()
  extra_values?: Record<string, string>;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/\S/, { message: '$property must contain text' })
  @MaxLength(240)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  salutation?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: '$property must contain text' })
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  closing?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  recipient_address?: string | null;
}

export class LetterQueryDto {
  @IsOptional()
  @IsIn(Object.values(LetterStatusEnum))
  status?: LetterStatusEnum;

  @IsOptional()
  @IsIn(Object.values(LetterTypeEnum))
  letter_type?: LetterTypeEnum;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employee_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  candidate_id?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class LetterApproveDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class LetterReasonDto {
  @Transform(trim)
  @IsString()
  @Matches(/\S/, { message: '$property must contain text' })
  @MaxLength(1000)
  reason: string;
}

export class LetterIssueDto {
  @IsOptional()
  @IsBoolean()
  send_email?: boolean;
}

export class RecipientSearchDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['employee', 'candidate', 'any'])
  kind?: 'employee' | 'candidate' | 'any';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class LetterVerificationLookupDto {
  @IsString()
  @MaxLength(64)
  token: string;
}
