import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateAttendanceWorkFromHomeRequestDto {
  @ApiProperty({ example: '2026-11-02' })
  @IsDateString({ strict: true })
  start_date: string;

  @ApiProperty({ example: '2026-11-02' })
  @IsDateString({ strict: true })
  end_date: string;

  @ApiProperty({ example: 'Working remotely while awaiting a home repair.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason: string;
}
