import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitKpiSelfReviewDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;
}

export class SubmitKpiManagerReviewDto extends SubmitKpiSelfReviewDto {
  @IsOptional()
  @IsBoolean()
  on_behalf?: boolean;
}

export class RespondToMidKpiReviewDto {
  @IsIn(['ACKNOWLEDGE', 'DISPUTE'])
  decision: 'ACKNOWLEDGE' | 'DISPUTE';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;
}

export class FinalizeKpiReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;
}

export class ReopenKpiReviewDto {
  @IsString()
  @MaxLength(5000)
  reason: string;
}
