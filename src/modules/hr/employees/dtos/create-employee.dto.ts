import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { EmployeeDepartmentInputDto } from './employee-department-input.dto';

export class CreateEmployeeDto {
  @Type(() => Number)
  @IsInt()
  user_id: number;

  @IsString()
  @IsNotEmpty()
  employee_no: string;

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

  @IsString()
  @IsOptional()
  gender?: string;

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
  national_id_no?: string;

  @IsString()
  @IsOptional()
  passport_no?: string;

  @IsString()
  @IsOptional()
  tax_id_no?: string;

  @IsString()
  @IsOptional()
  social_security_no?: string;

  @IsEmail()
  @IsOptional()
  work_email?: string;

  @IsEmail()
  @IsOptional()
  personal_email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  alternate_phone?: string;

  @IsString()
  @IsOptional()
  address_line_1?: string;

  @IsString()
  @IsOptional()
  address_line_2?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  postal_code?: string;

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
  position_id?: number;

  @ApiPropertyOptional({
    enum: ['onboarding', 'active', 'suspended', 'terminated', 'exited'],
  })
  @IsIn(['onboarding', 'active', 'suspended', 'terminated', 'exited'])
  @IsOptional()
  employment_status?: string;

  @ApiPropertyOptional({
    enum: [
      'full_time',
      'part_time',
      'contract',
      'intern',
      'consultant',
      'temporary',
    ],
  })
  @IsIn([
    'full_time',
    'part_time',
    'contract',
    'intern',
    'consultant',
    'temporary',
  ])
  @IsOptional()
  employment_type?: string;

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
  emergency_contact_name?: string;

  @IsString()
  @IsOptional()
  emergency_contact_phone?: string;

  @IsString()
  @IsOptional()
  emergency_contact_relationship?: string;

  @IsString()
  @IsOptional()
  bank_name?: string;

  @IsString()
  @IsOptional()
  bank_account_no?: string;

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
  @ArrayUnique((department: EmployeeDepartmentInputDto) => department.department_id)
  @ValidateNested({ each: true })
  @Type(() => EmployeeDepartmentInputDto)
  @IsOptional()
  departments?: EmployeeDepartmentInputDto[];
}
