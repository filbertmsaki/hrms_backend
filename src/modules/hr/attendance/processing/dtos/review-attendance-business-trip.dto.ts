import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewAttendanceBusinessTripDto {
  @ApiPropertyOptional({ example: 'Approved by HR manager' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  note?: string;
}
