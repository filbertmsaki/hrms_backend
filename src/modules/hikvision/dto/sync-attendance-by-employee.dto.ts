import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, MaxLength } from 'class-validator';

export class SyncAttendanceByEmployeeDto {
  @ApiProperty({ example: '00000062' })
  @IsString()
  @MaxLength(100)
  employeeNo: string;

  @ApiProperty({ example: '2026-05-29T00:00:00+03:00' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: '2026-05-29T23:59:59+03:00' })
  @IsDateString()
  endTime: string;
}
