import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
} from 'class-validator';
import { ProfileChangeRequestStatusEnum } from '../enums/profile-change-request-status.enum';
import { ProfileChangeRequestTypeEnum } from '../enums/profile-change-request-type.enum';

export class ProfileChangeRequestQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  limit?: number = 20;

  @ApiPropertyOptional({ enum: ProfileChangeRequestStatusEnum })
  @IsOptional()
  @IsEnum(ProfileChangeRequestStatusEnum)
  status?: ProfileChangeRequestStatusEnum;

  @ApiPropertyOptional({ enum: ProfileChangeRequestTypeEnum })
  @IsOptional()
  @IsEnum(ProfileChangeRequestTypeEnum)
  request_type?: ProfileChangeRequestTypeEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  employee_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  branch_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  department_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to_date?: string;
}
