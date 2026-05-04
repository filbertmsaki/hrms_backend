import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class SwitchCompanyDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  company_id: number;
}
