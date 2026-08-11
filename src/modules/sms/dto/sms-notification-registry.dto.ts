import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSmsNotificationRegistryDto {
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sms_template?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
