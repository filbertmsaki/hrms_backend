import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayContains,
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import {
  TANZANIA_PHONE_CANONICAL_REGEX,
  normalizeTanzaniaPhone,
} from '../../../../common/utils/tanzania-phone.util';
import { EmploymentTypeEnum } from '../../employees/enums/employment-type.enum';
import { EmployeeInvitationChannel } from '../enums/employee-invitation.enum';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateEmployeeInvitationDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  first_name: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  last_name: string;

  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(['male', 'female'])
  gender: string;

  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+255762650393' })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string'
      ? (normalizeTanzaniaPhone(value) ?? value.trim())
      : value,
  )
  @Matches(TANZANIA_PHONE_CANONICAL_REGEX, {
    message: 'Phone number must be a valid Tanzanian number in +255 format',
  })
  phone: string;

  @Type(() => Number)
  @IsInt()
  primary_branch_id: number;

  @Type(() => Number)
  @IsInt()
  primary_department_id: number;

  @Type(() => Number)
  @IsInt()
  primary_position_id: number;

  @ApiProperty({ enum: EmploymentTypeEnum })
  @IsEnum(EmploymentTypeEnum)
  employment_type: EmploymentTypeEnum;

  @ApiPropertyOptional({ type: Number })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  reports_to?: number;

  @IsDateString()
  @IsOptional()
  hire_date?: string;

  @ApiPropertyOptional({ type: Number })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  onboarding_workflow_id?: number;

  @ApiProperty({ enum: EmployeeInvitationChannel, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayContains([
    EmployeeInvitationChannel.EMAIL,
    EmployeeInvitationChannel.SMS,
  ])
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsEnum(EmployeeInvitationChannel, { each: true })
  channels: EmployeeInvitationChannel[];
}
