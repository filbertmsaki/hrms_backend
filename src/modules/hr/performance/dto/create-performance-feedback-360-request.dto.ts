import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PerformanceFeedback360RelationshipEnum } from '../enums/performance-feedback-360-relationship.enum';

class Feedback360InviteDto {
  @IsInt()
  rater_employee_id: number;

  @IsEnum(PerformanceFeedback360RelationshipEnum)
  relationship_type: PerformanceFeedback360RelationshipEnum;

  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsBoolean()
  is_anonymous?: boolean;
}

export class CreatePerformanceFeedback360RequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => Feedback360InviteDto)
  invitations: Feedback360InviteDto[];
}
