import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateAttendanceAlertEmailPreferenceDto {
  @IsOptional()
  @IsBoolean()
  late?: boolean;

  @IsOptional()
  @IsBoolean()
  absent?: boolean;
}
