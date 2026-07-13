import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTestNotificationDto {
  @IsInt()
  receiver_company_user_id: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  entity_type?: string;

  @IsString()
  @IsOptional()
  entity_id?: string;

  @IsString()
  @IsOptional()
  action_url?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
