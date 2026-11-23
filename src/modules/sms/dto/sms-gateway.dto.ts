import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateSmsGatewayDto {
  @IsBoolean() enabled: boolean;
  @IsString() @IsNotEmpty() @MaxLength(2048) endpoint: string;
  @IsString() @IsNotEmpty() @MaxLength(160) username: string;
  @IsString() @IsNotEmpty() @MaxLength(80) shortcode: string;
  @IsString() @MaxLength(80) channel: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(2048) password?: string;
}
