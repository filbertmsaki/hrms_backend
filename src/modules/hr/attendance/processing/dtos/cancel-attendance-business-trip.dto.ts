import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelAttendanceBusinessTripDto {
  @ApiPropertyOptional({ example: 'Trip postponed' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  reason?: string;
}
