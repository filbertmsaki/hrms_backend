import { IsDateString, IsOptional } from 'class-validator';

export class ManagerDashboardQueryDto {
  @IsDateString()
  @IsOptional()
  date_from?: string;

  @IsDateString()
  @IsOptional()
  date_to?: string;
}
