import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateMyLeaveRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  leave_type_id: number;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  @IsString()
  @MaxLength(2000)
  reason: string;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  submit?: boolean;
}
