import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SyncSystemKpisDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  provider_key?: string;
}
