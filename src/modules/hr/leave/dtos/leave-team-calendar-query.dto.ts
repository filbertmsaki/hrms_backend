import { IsDateString } from 'class-validator';

export class LeaveTeamCalendarQueryDto {
  @IsDateString()
  from_date: string;

  @IsDateString()
  to_date: string;
}
