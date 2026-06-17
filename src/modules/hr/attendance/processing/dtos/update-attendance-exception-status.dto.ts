import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAttendanceExceptionStatusDto {
  @ApiProperty({ example: 'RESOLVED', enum: ['OPEN', 'RESOLVED', 'IGNORED'] })
  @IsString()
  @IsIn(['OPEN', 'RESOLVED', 'IGNORED'])
  status: string;

  @ApiProperty({
    example: 'Employee mapping fixed and summary recalculated',
    required: false,
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  resolution_note?: string;
}
