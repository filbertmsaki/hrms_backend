import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class SupportTranscriptEntryDto {
  @IsOptional()
  @IsIn(['user', 'assistant'])
  role?: 'user' | 'assistant';

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  content?: string;
}

export class EscalateSupportDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupportTranscriptEntryDto)
  transcript?: SupportTranscriptEntryDto[];
}
