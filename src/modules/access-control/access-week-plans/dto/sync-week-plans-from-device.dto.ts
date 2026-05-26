import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class SyncWeekPlansFromDeviceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  schedule_template_id: number;
}
