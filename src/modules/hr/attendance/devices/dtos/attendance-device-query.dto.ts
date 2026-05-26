import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { AttendanceDeviceStatusEnum } from '../enums/attendance-device-status.enum';

export class AttendanceDeviceQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: AttendanceDeviceStatusEnum })
  @IsEnum(AttendanceDeviceStatusEnum)
  @IsOptional()
  status?: AttendanceDeviceStatusEnum;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(80)
  @IsOptional()
  vendor_name?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(40)
  @IsOptional()
  integration_type?: string;
}





