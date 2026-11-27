import { IsBoolean, IsInt, Min, Max } from 'class-validator';

export class UpdateAttendanceCleanupSettingsDto {
  @IsBoolean()
  recalculationJobs: boolean;

  @IsBoolean()
  unmatchedLogs: boolean;

  @IsBoolean()
  expiredSignInRequests: boolean;

  @IsBoolean()
  notificationQueue: boolean;

  @IsBoolean()
  importQueue: boolean;

  @IsInt()
  @Min(7)
  @Max(3650)
  queueRetentionDays: number;
}
