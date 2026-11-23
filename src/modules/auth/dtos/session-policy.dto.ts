import { IsInt, Max, Min } from 'class-validator';

export class SessionPolicyDto {
  @IsInt()
  @Min(60)
  @Max(3600)
  access_seconds: number;

  @IsInt()
  @Min(300)
  @Max(7776000)
  refresh_seconds: number;

  @IsInt()
  @Min(3600)
  @Max(7776000)
  absolute_seconds: number;

  @IsInt()
  @Min(300)
  @Max(86400)
  idle_seconds: number;

  @IsInt()
  @Min(1)
  @Max(50)
  max_sessions: number;
}
