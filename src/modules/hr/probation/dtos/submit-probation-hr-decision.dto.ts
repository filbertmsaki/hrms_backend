import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { ProbationFinalDecisionEnum } from '../enums/probation-final-decision.enum';

export class SubmitProbationHrDecisionDto {
  @IsEnum(ProbationFinalDecisionEnum)
  decision: ProbationFinalDecisionEnum;

  @IsString()
  @MaxLength(4000)
  comments: string;

  @IsDateString()
  @IsOptional()
  confirmation_date?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  extension_days?: number;

  @IsDateString()
  @IsOptional()
  extension_end_date?: string;
}
