import { IsOptional, IsInt, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class IssueAttendanceCheckpointQrTokenDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(300)
  valid_for_seconds?: number;
}
