import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ReportEmailDeliveryStatusEnum } from '../enums/report-email-delivery-status.enum';
import { ReportExecutionSourceEnum } from '../enums/report-execution-source.enum';
import { ReportExecutionStatusEnum } from '../enums/report-execution-status.enum';
import { ReportOutputFormatEnum } from '../enums/report-output-format.enum';
import { ReportRecipientChannelEnum } from '../enums/report-recipient-channel.enum';
import { ReportRecipientTypeEnum } from '../enums/report-recipient-type.enum';
import { ReportScheduleMisfireHandlingEnum } from '../enums/report-schedule-misfire-handling.enum';
import { ReportScheduleTypeEnum } from '../enums/report-schedule-type.enum';
import { ReportSmtpSecurityTypeEnum } from '../enums/report-smtp-security-type.enum';
import { ReportTemplateDateRangeStrategyEnum } from '../enums/report-template-date-range-strategy.enum';
import { ReportWeekdayEnum } from '../enums/report-weekday.enum';

function toBoolean(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }

  return value;
}

export class CreateReportTemplateRecipientDto {
  @IsEnum(ReportRecipientChannelEnum)
  channel: ReportRecipientChannelEnum;

  @IsEnum(ReportRecipientTypeEnum)
  recipientType: ReportRecipientTypeEnum;

  @IsEmail()
  @IsOptional()
  emailAddress?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  companyUserId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employeeId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  roleId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  departmentId?: number;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  dynamicGroupCode?: string;

  @IsString()
  @MaxLength(150)
  @IsOptional()
  displayName?: string;
}

export class ReportSmtpConfigurationFieldsDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsString()
  @MaxLength(255)
  host: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  port: number;

  @IsEnum(ReportSmtpSecurityTypeEnum)
  @IsOptional()
  securityType?: ReportSmtpSecurityTypeEnum;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @MaxLength(150)
  @IsOptional()
  senderName?: string;

  @IsEmail()
  senderEmail: string;

  @IsEmail()
  @IsOptional()
  replyToEmail?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @IsOptional()
  connectionTimeoutMs?: number;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class TestDraftReportSmtpConfigurationDto extends ReportSmtpConfigurationFieldsDto {
  @IsEmail()
  @IsOptional()
  testRecipientEmail?: string;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  @IsOptional()
  sendTestEmail?: boolean;
}

export class TestSystemSmtpConfigurationDto {
  @IsEmail()
  @IsOptional()
  testRecipientEmail?: string;
}

export class CreateReportSmtpConfigurationDto extends ReportSmtpConfigurationFieldsDto {
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  smtpTestToken?: string;

  @IsEmail()
  @IsOptional()
  testRecipientEmail?: string;
}

export class UpdateReportSmtpConfigurationDto extends PartialType(
  ReportSmtpConfigurationFieldsDto,
) {
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  smtpTestToken?: string;

  @IsEmail()
  @IsOptional()
  testRecipientEmail?: string;
}

export class TestReportSmtpConfigurationDto {
  @IsEmail()
  @IsOptional()
  toEmail?: string;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  @IsOptional()
  sendTestEmail?: boolean;
}

export class CreateReportTemplateDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  reportDefinitionId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  smtpConfigurationId?: number | null;

  @IsString()
  @MaxLength(150)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ReportOutputFormatEnum)
  @IsOptional()
  outputFormat?: ReportOutputFormatEnum | null;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  filenamePattern?: string | null;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  emailSubjectTemplate?: string | null;

  @IsString()
  @IsOptional()
  emailBodyTemplate?: string | null;

  @IsEnum(ReportTemplateDateRangeStrategyEnum)
  @IsOptional()
  dateRangeStrategy?: ReportTemplateDateRangeStrategyEnum | null;

  @IsObject()
  @IsOptional()
  dateRangeConfig?: Record<string, unknown> | null;

  @IsObject()
  @IsOptional()
  reportFilters?: Record<string, unknown> | null;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  @IsOptional()
  attachReport?: boolean;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateReportTemplateRecipientDto)
  @IsOptional()
  recipients?: CreateReportTemplateRecipientDto[];
}

export class UpdateReportTemplateDto extends PartialType(
  CreateReportTemplateDto,
) {}

export class CreateReportScheduleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  templateId: number;

  @IsString()
  @MaxLength(150)
  name: string;

  @IsEnum(ReportScheduleTypeEnum)
  scheduleType: ReportScheduleTypeEnum;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  executionTime?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  dayOfMonth?: number | null;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  timezone?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string | null;

  @IsDateString()
  @IsOptional()
  endDate?: string | null;

  @IsDateString()
  @IsOptional()
  oneTimeRunAt?: string | null;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  cronExpression?: string | null;

  @IsEnum(ReportScheduleMisfireHandlingEnum)
  @IsOptional()
  misfireHandling?: ReportScheduleMisfireHandlingEnum;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  maxRetryAttempts?: number;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsEnum(ReportWeekdayEnum, { each: true })
  @IsOptional()
  weekdays?: ReportWeekdayEnum[];
}

export class UpdateReportScheduleDto extends PartialType(
  CreateReportScheduleDto,
) {}

export class QueryReportSmtpConfigurationsDto extends PaginationDto {
  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class QueryReportTemplatesDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  reportDefinitionId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  smtpConfigurationId?: number;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class QueryReportSchedulesDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  templateId?: number;

  @IsEnum(ReportScheduleTypeEnum)
  @IsOptional()
  scheduleType?: ReportScheduleTypeEnum;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class QueryReportExecutionsDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  templateId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  scheduleId?: number;

  @IsEnum(ReportExecutionStatusEnum)
  @IsOptional()
  status?: ReportExecutionStatusEnum;

  @IsEnum(ReportEmailDeliveryStatusEnum)
  @IsOptional()
  emailDeliveryStatus?: ReportEmailDeliveryStatusEnum;

  @IsEnum(ReportExecutionSourceEnum)
  @IsOptional()
  source?: ReportExecutionSourceEnum;
}
