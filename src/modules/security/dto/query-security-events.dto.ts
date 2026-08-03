import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SecurityEventOutcome } from '../enums/security-event-outcome.enum';
import { SecurityEventType } from '../enums/security-event-type.enum';

export class QuerySecurityEventsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsEnum(SecurityEventType)
  event_type?: SecurityEventType;

  @IsOptional()
  @IsEnum(SecurityEventOutcome)
  outcome?: SecurityEventOutcome;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  target_user_id?: number;

  @IsOptional()
  @IsString()
  request_id?: string;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;
}
