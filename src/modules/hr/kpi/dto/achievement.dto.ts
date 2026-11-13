import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Base64FileDto } from '../../../files/dtos/base64-file.dto';

export class AchievementDraftDto {
  @Type(() => Number) @IsInt() @Min(1) assignmentId: number;
  @IsOptional() actual?: unknown;
  @IsOptional() @IsString() @MaxLength(4000) comments?: string;
}
export class AchievementUpdateDto {
  @IsOptional() actual?: unknown;
  @IsOptional() @IsString() @MaxLength(4000) comments?: string;
  @Type(() => Number) @IsInt() @Min(1) rowVersion: number;
}
export class AchievementReviewDto {
  @IsOptional() @IsString() @MaxLength(4000) comments?: string;
  @Type(() => Number) @IsInt() @Min(1) rowVersion: number;
}
export class EvidenceUploadDto {
  @ValidateNested() @Type(() => Base64FileDto) @IsDefined() file: Base64FileDto;
  @Type(() => Number) @IsInt() @Min(1) rowVersion: number;
}
export class EvidenceRuleDto {
  @IsBoolean() required: boolean;
}
