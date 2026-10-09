import { IsArray, IsIn, IsOptional } from 'class-validator';

export class SubmitOnboardingEmployeeDetailsDto {
  @IsOptional()
  @IsArray()
  @IsIn(['professional_qualifications', 'experience_details'], { each: true })
  not_provided_items?: string[];
}
