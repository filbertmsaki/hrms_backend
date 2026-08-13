import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class ConfigureEmployeeNumberDto {
  @Matches(/^$|^[A-Z0-9]{2,20}$/, {
    message:
      'prefix must be blank or contain 2 to 20 uppercase letters and numbers',
  })
  prefix: string;

  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(12)
  @IsOptional()
  padding?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  next_number?: number;
}
