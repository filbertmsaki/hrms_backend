import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CompleteOnboardingTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  completion_notes?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  evidence_document_id?: number;

  @IsObject()
  @IsOptional()
  completion_data?: Record<string, unknown>;
}
