import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class EvaluationTemplateDto {
  @IsString() @IsNotEmpty() @MaxLength(80) code: string;
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @IsArray() competencies: Array<{
    code: string;
    name: string;
    description?: string;
  }>;
  @IsArray() scale: Array<{
    value: number;
    label: string;
    description?: string;
  }>;
  @IsBoolean() requireHrReview: boolean;
  @IsOptional() @IsObject() sectionWeights?: {
    kpi: number;
    competency: number;
  };
}
export class TemplateRevisionDto {
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @IsArray() competencies: EvaluationTemplateDto['competencies'];
  @IsArray() scale: EvaluationTemplateDto['scale'];
  @IsBoolean() requireHrReview: boolean;
  @IsOptional()
  @IsObject()
  sectionWeights?: EvaluationTemplateDto['sectionWeights'];
}
export class EvaluationCycleDto {
  @IsString() @IsNotEmpty() @MaxLength(80) code: string;
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @IsIn(['monthly', 'quarterly', 'semiannual', 'annual']) frequency:
    | 'monthly'
    | 'quarterly'
    | 'semiannual'
    | 'annual';
  @Type(() => Number) @IsInt() @Min(1) periodId: number;
  @Type(() => Number) @IsInt() @Min(1) templateVersionId: number;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsOptional() @IsDateString() selfDeadline?: string;
  @IsOptional() @IsDateString() managerDeadline?: string;
  @IsOptional() @IsDateString() hrDeadline?: string;
  @IsOptional() @IsDateString() ackDeadline?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  hrReviewerCompanyUserId?: number;
}
export class EvaluationReviewerDto {
  @Type(() => Number) @IsInt() @Min(1) companyUserId: number;
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}
export class EvaluationDeadlinePolicyDto {
  @IsIn(['soft', 'hard']) mode: 'soft' | 'hard';
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}
export class EvaluationDeadlineExceptionDto {
  @IsIn(['self', 'manager', 'hr', 'ack']) stage:
    | 'self'
    | 'manager'
    | 'hr'
    | 'ack';
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}
export class EvaluationEnrollDto {
  @Type(() => Number) @IsInt() @Min(1) employeeId: number;
  @Type(() => Number) @IsInt() @Min(1) managerEmployeeId: number;
  @Type(() => Number) @IsInt() @Min(1) scorecardId: number;
}
export class SelfAssessmentDto {
  @Type(() => Number) @IsInt() @Min(1) rowVersion: number;
  @IsString() @MaxLength(5000) achievements: string;
  @IsString() @MaxLength(5000) challenges: string;
  @IsString() @MaxLength(5000) observations: string;
  @IsString() @MaxLength(5000) developmentNeeds: string;
  @IsString() @MaxLength(5000) futureGoals: string;
  @IsString() @MaxLength(5000) comments: string;
  @IsOptional() @IsObject() competencyRatings?: Record<string, number>;
}
export class ManagerAssessmentDto {
  @Type(() => Number) @IsInt() @Min(1) rowVersion: number;
  @IsObject() competencyRatings: Record<string, number>;
  @IsString() @MaxLength(5000) strengths: string;
  @IsString() @MaxLength(5000) developmentNeeds: string;
  @IsString() @MaxLength(5000) feedback: string;
  @IsString() @MaxLength(5000) recommendations: string;
}
export class EvaluationActionDto {
  @Type(() => Number) @IsInt() @Min(1) rowVersion: number;
  @IsOptional() @IsString() @MaxLength(5000) comment?: string;
}
export class EvaluationAckDto {
  @IsIn(['acknowledged', 'disputed']) status: 'acknowledged' | 'disputed';
  @IsOptional() @IsString() @MaxLength(5000) comment?: string;
}
