import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProbationSelfRatingDto {
  @IsString()
  criterion_code: string;

  @IsNumber()
  @Min(0)
  rating: number;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  comment?: string;
}

export class ProbationObjectiveProgressDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  objective_id: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  completion_percent: number;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  comment?: string;
}

export class SubmitProbationSelfAssessmentDto {
  @IsString()
  @MaxLength(4000)
  overall_comment: string;

  @ApiPropertyOptional({ type: [ProbationSelfRatingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProbationSelfRatingDto)
  @IsOptional()
  ratings?: ProbationSelfRatingDto[];

  @ApiPropertyOptional({ type: [ProbationObjectiveProgressDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProbationObjectiveProgressDto)
  @IsOptional()
  objectives?: ProbationObjectiveProgressDto[];
}
