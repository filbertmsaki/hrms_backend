import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class SyncAccessScheduleTemplateDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  device_id: number;
}
