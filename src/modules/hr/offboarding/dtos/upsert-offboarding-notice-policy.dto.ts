import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpsertOffboardingNoticePolicyDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() employment_type?: string | null;
  @IsOptional() @IsInt() grade_id?: number | null;
  @IsOptional() @IsInt() position_id?: number | null;
  @IsOptional() @IsString() confirmation_status?: string | null;
  @IsInt() @Min(0) @Max(3650) notice_days: number;
  @IsOptional() @IsBoolean() allow_waiver?: boolean;
  @IsOptional() @IsBoolean() calculate_calendar_days?: boolean;
  @IsOptional() @IsInt() priority?: number;
  @IsOptional() @IsString() status?: string;
}
