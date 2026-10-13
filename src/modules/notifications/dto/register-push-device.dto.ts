import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export class RegisterPushDeviceDto {
  @IsString()
  @Length(20, 255)
  @Matches(/^Expo(nent)?PushToken\[[^\]]+\]$/)
  expo_push_token: string;

  @IsString()
  @IsIn(['ios', 'android'])
  platform: 'ios' | 'android';

  @IsOptional()
  @IsString()
  @Length(1, 120)
  device_name?: string;
}

export class UnregisterPushDeviceDto {
  @IsString()
  @Length(20, 255)
  @Matches(/^Expo(nent)?PushToken\[[^\]]+\]$/)
  expo_push_token: string;
}
