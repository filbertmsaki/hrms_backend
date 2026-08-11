import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CompleteOffboardingTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  remarks?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  evidence_document_id?: number;

  @IsObject()
  @IsOptional()
  completion_data?: Record<string, unknown>;
}
