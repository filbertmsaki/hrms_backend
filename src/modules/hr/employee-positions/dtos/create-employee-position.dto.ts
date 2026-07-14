import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { EmployeePositionAssignmentTypeEnum } from '../../employees/enums/employee-position-assignment-type.enum';
import { EmployeePositionStatusEnum } from '../../employees/enums/employee-position-status.enum';

export class CreateEmployeePositionDto {
  @Type(() => Number)
  @IsInt()
  employee_id: number;

  @Type(() => Number)
  @IsInt()
  position_id: number;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;

  @IsDateString()
  @IsNotEmpty()
  start_date: string;

  @IsDateString()
  @IsOptional()
  end_date?: string;

  @ApiPropertyOptional({ enum: EmployeePositionAssignmentTypeEnum })
  @IsEnum(EmployeePositionAssignmentTypeEnum)
  @IsOptional()
  assignment_type?: EmployeePositionAssignmentTypeEnum;

  @ApiPropertyOptional({ enum: EmployeePositionStatusEnum })
  @IsEnum(EmployeePositionStatusEnum)
  @IsOptional()
  status?: EmployeePositionStatusEnum;

  @IsString()
  @IsOptional()
  notes?: string;
}
