import { IsBoolean } from 'class-validator';

export class UpdateSmsGlobalSettingDto {
  @IsBoolean()
  is_enabled: boolean;
}
