import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class OnboardingEmployeeDetailSectionReviewDto {
  @IsString()
  @MaxLength(80)
  section_key: string;

  @IsIn(['approved', 'changes_requested'])
  status: 'approved' | 'changes_requested';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ReviewOnboardingEmployeeDetailsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OnboardingEmployeeDetailSectionReviewDto)
  sections: OnboardingEmployeeDetailSectionReviewDto[];
}
