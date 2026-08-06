import {
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { PerformanceImprovementMilestoneStatusEnum } from '../enums/performance-improvement-milestone-status.enum';

export class ReviewPerformanceImprovementMilestoneDto {
  @IsEnum(PerformanceImprovementMilestoneStatusEnum)
  status: PerformanceImprovementMilestoneStatusEnum;

  @IsOptional()
  @IsString()
  manager_comment?: string;
}
