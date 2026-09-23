import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class NotificationRuleQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  notification_type?: string;

  @IsOptional()
  @IsString()
  trigger_event?: string;

  @IsOptional()
  @IsString()
  related_module?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() === 'true' : value,
  )
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
