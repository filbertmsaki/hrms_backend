import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
} from 'class-validator';

export class UpsertKpiAchievementDto {
  @IsOptional()
  @IsNumber()
  achievement_value?: number;

  @IsOptional()
  @IsArray()
  evidence?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}
