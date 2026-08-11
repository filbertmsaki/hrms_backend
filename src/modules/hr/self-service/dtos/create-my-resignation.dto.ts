import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMyResignationDto {
  @IsDateString()
  last_working_date: string;

  @IsString()
  @MaxLength(3000)
  reason: string;

  @IsDateString()
  @IsOptional()
  notice_date?: string;
}
