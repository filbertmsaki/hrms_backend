import { IsDateString, Matches } from 'class-validator';

export class LeaveTeamCalendarQueryDto {
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from_date: string;

  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to_date: string;
}
