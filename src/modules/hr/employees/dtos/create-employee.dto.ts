import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { EmployeeAddressInputDto } from './employee-address-input.dto';
import { EmployeeAcademicQualificationInputDto } from './employee-academic-qualification-input.dto';
import { EmployeeBankAccountInputDto } from './employee-bank-account-input.dto';
import { EmployeeContactInputDto } from './employee-contact-input.dto';
import { EmployeeDepartmentInputDto } from './employee-department-input.dto';
import { EmployeeExperienceInputDto } from './employee-experience-input.dto';
import { EmployeeIdentificationInputDto } from './employee-identification-input.dto';
import { EmployeeProfessionalQualificationInputDto } from './employee-professional-qualification-input.dto';
import { EmployeeRelativeInputDto } from './employee-relative-input.dto';
import { EmploymentStatusEnum } from '../enums/employment-status.enum';
import { EmploymentTypeEnum } from '../enums/employment-type.enum';
import { EmployeeOnboardingInputDto } from '../../onboarding/dtos/employee-onboarding-input.dto';

export class CreateEmployeeDto {
  @ApiPropertyOptional({ description: 'Leave blank to auto-generate (AICL-XXXXXX)' })
  @IsString()
  @IsOptional()
  employee_no?: string;

  @IsString()
  @IsNotEmpty()
  first_name: string;

  @IsString()
  @IsOptional()
  middle_name?: string;

  @IsString()
  @IsNotEmpty()
  last_name: string;

  @IsString()
  @IsOptional()
  preferred_name?: string;

  @ApiProperty({ enum: ['male', 'female'] })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @IsIn(['male', 'female'])
  gender: string;

  @IsDateString()
  @IsOptional()
  date_of_birth?: string;

  @IsString()
  @IsOptional()
  marital_status?: string;

  @IsString()
  @IsOptional()
  nationality?: string;

  @IsString()
  @IsOptional()
  profile_photo_url?: string;

  @ApiPropertyOptional({ type: Number })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  primary_branch_id?: number;

  @ApiPropertyOptional({ type: Number })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  primary_department_id?: number;

  @ApiPropertyOptional({ type: Number })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  primary_position_id?: number;

  @ApiPropertyOptional({ type: Number })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  primary_designation_id?: number;

  @ApiPropertyOptional({
    type: Number,
    description:
      'Deprecated. Use primary_position_id. Kept temporarily for backward compatibility.',
  })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  position_id?: number;

  @ApiPropertyOptional({
    enum: EmploymentStatusEnum,
  })
  @IsEnum(EmploymentStatusEnum)
  @IsOptional()
  employment_status?: EmploymentStatusEnum;

  @ApiPropertyOptional({
    enum: EmploymentTypeEnum,
  })
  @IsEnum(EmploymentTypeEnum)
  @IsOptional()
  employment_type?: EmploymentTypeEnum;

  @IsDateString()
  @IsOptional()
  hire_date?: string;

  @IsDateString()
  @IsOptional()
  probation_end_date?: string;

  @IsDateString()
  @IsOptional()
  confirmation_date?: string;

  @IsDateString()
  @IsOptional()
  exit_date?: string;

  @ApiPropertyOptional({ type: Number })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  reports_to?: number;

  @IsString()
  @IsOptional()
  exit_reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeDepartmentInputDto)
  @IsOptional()
  departments?: EmployeeDepartmentInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeContactInputDto)
  @IsOptional()
  contacts?: EmployeeContactInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeAddressInputDto)
  @IsOptional()
  addresses?: EmployeeAddressInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeRelativeInputDto)
  @IsOptional()
  relatives?: EmployeeRelativeInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeIdentificationInputDto)
  @IsOptional()
  identifications?: EmployeeIdentificationInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeBankAccountInputDto)
  @IsOptional()
  bank_accounts?: EmployeeBankAccountInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeAcademicQualificationInputDto)
  @IsOptional()
  academic_qualifications?: EmployeeAcademicQualificationInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeProfessionalQualificationInputDto)
  @IsOptional()
  professional_qualifications?: EmployeeProfessionalQualificationInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeExperienceInputDto)
  @IsOptional()
  experience_details?: EmployeeExperienceInputDto[];

  @ValidateNested()
  @Type(() => EmployeeOnboardingInputDto)
  @IsOptional()
  onboarding?: EmployeeOnboardingInputDto;
}
