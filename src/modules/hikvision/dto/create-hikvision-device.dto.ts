import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { AttendanceDeviceStatusEnum } from '../../access-control/attendance-devices/enums/attendance-device-status.enum';

export class CreateHikvisionDeviceDto {
  @ApiPropertyOptional({ example: 'Main Gate Reader' })
  @IsString()
  @MaxLength(150)
  @IsOptional()
  device_name?: string;

  @ApiPropertyOptional({ example: 'HIK-BR1-GATE-01' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  device_code?: string;

  @IsString()
  @MaxLength(255)
  ip_address: string;

  @ApiPropertyOptional({ example: 80, default: 80 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  port?: number;

  @ApiPropertyOptional({ example: 'http', default: 'http' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  protocol?: string;

  @IsString()
  @MaxLength(120)
  username: string;

  @IsString()
  password: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number | null;

  @ApiPropertyOptional({ enum: AttendanceDeviceStatusEnum })
  @IsEnum(AttendanceDeviceStatusEnum)
  @IsOptional()
  status?: AttendanceDeviceStatusEnum;

  @ApiPropertyOptional({ example: 'Africa/Dar_es_Salaam' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(255)
  @IsOptional()
  location_description?: string;

  @ApiPropertyOptional({
    description: 'Optional extra metadata to keep on the backend',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
