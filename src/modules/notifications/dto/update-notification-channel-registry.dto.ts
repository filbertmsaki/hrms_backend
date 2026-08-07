import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateNotificationChannelRegistryDto {
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
