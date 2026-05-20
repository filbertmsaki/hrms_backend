import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateHolidayGroupDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;
}




