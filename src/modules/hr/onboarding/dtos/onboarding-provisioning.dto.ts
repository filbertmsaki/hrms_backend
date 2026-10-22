import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { OnboardingAttendanceModeEnum } from '../enums/onboarding-attendance-mode.enum';
import { OnboardingDeviceProvisioningDto } from './onboarding-device-provisioning.dto';
import { OnboardingShiftProvisioningDto } from './onboarding-shift-provisioning.dto';
import { OnboardingTimetableProvisioningDto } from './onboarding-timetable-provisioning.dto';

export class OnboardingProvisioningDto {
  @ApiPropertyOptional({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  role_ids?: number[];

  @ApiPropertyOptional({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  branch_access_ids?: number[];

  @ApiPropertyOptional({ enum: OnboardingAttendanceModeEnum })
  @IsEnum(OnboardingAttendanceModeEnum)
  @IsOptional()
  attendance_mode?: OnboardingAttendanceModeEnum;

  @ApiPropertyOptional({
    description:
      'Explicit active attendance policy to bind to this employee onboarding.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  attendance_policy_id?: number;

  @ApiPropertyOptional({
    description:
      'Explicit leave policy to use when assigning onboarding leave balances.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  leave_policy_id?: number;

  @ValidateNested()
  @Type(() => OnboardingShiftProvisioningDto)
  @IsOptional()
  shift_assignment?: OnboardingShiftProvisioningDto;

  @ValidateNested()
  @Type(() => OnboardingTimetableProvisioningDto)
  @IsOptional()
  timetable_assignment?: OnboardingTimetableProvisioningDto;

  @ValidateNested()
  @Type(() => OnboardingDeviceProvisioningDto)
  @IsOptional()
  device_assignment?: OnboardingDeviceProvisioningDto;
}
