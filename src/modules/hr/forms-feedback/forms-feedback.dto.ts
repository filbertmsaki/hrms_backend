import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class FormQuestionDto {
  @IsString() @Matches(/^[a-zA-Z0-9_-]{1,64}$/) id: string;
  @IsString() @MaxLength(500) label: string;
  @IsIn([
    'short_text',
    'long_text',
    'single_choice',
    'multiple_choice',
    'yes_no',
    'rating',
    'number',
    'date',
  ])
  type: string;
  @IsBoolean() required: boolean;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  options?: string[];
}
export class FormScheduleDto {
  @IsIn(['once', 'weekly', 'monthly']) frequency: 'once' | 'weekly' | 'monthly';
  @IsString() @MaxLength(80) timezone: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) time: string;
  @IsOptional() @IsInt() @Min(1) @Max(31) dayOfMonth?: number;
  @IsOptional() @IsBoolean() useLastDay?: boolean;
  @IsInt() @Min(1) @Max(90) openDays: number;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate?: string;
  @IsOptional() @IsInt() @Min(1) @Max(120) occurrences?: number;
  @IsOptional() @IsInt() @Min(1) @Max(30) reminderDays?: number;
}
export class FormAudienceDto {
  @IsIn(['all', 'branches', 'departments']) type:
    | 'all'
    | 'branches'
    | 'departments';
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
export class SaveFormDto {
  @IsString() @MaxLength(200) title: string;
  @IsString() @MaxLength(2000) description: string;
  @IsIn(['survey', 'poll', 'data_collection']) kind: string;
  @IsIn(['identified', 'anonymous']) responseMode: 'identified' | 'anonymous';
  @IsBoolean() satisfaction: boolean;
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FormQuestionDto)
  questions: FormQuestionDto[];
  @ValidateNested() @Type(() => FormAudienceDto) audience: FormAudienceDto;
  @ValidateNested() @Type(() => FormScheduleDto) schedule: FormScheduleDto;
}
export class SubmitFormDto {
  @IsObject() answers: Record<string, unknown>;
}
export class FormListDto {
  @IsOptional()
  @IsIn([
    'all',
    'draft',
    'scheduled',
    'open',
    'closed',
    'paused',
    'pending',
    'submitted',
  ])
  status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class SatisfactionQueryDto {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}
