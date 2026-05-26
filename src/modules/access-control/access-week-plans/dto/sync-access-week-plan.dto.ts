import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class SyncAccessWeekPlanDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  device_id: number;
}
