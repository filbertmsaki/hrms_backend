import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class SyncAttendanceByRangeDto {
  @ApiProperty({ example: '2026-05-29T00:00:00+03:00' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: '2026-05-29T23:59:59+03:00' })
  @IsDateString()
  endTime: string;
}
