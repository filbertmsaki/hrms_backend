import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { OffboardingExitInterviewStatusEnum } from '../enums/offboarding-exit-interview-status.enum';
import { OffboardingKnowledgeTransferStatusEnum } from '../enums/offboarding-knowledge-transfer-status.enum';

export class UpsertOffboardingExitInterviewDto {
  @IsEnum(OffboardingExitInterviewStatusEnum)
  @IsOptional()
  status?: OffboardingExitInterviewStatusEnum;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  exit_reason_category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  employee_feedback?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  manager_feedback?: string;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  rehire_eligible?: boolean;

  @IsEnum(OffboardingKnowledgeTransferStatusEnum)
  @IsOptional()
  knowledge_transfer_status?: OffboardingKnowledgeTransferStatusEnum;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  handover_notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  final_notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
