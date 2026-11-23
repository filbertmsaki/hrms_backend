import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class ProviderDto {
  @IsString() @Length(1, 512) issuer: string;
  @IsString() @Length(1, 256) client_id: string;
  @IsOptional() @IsString() @Length(1, 2048) client_secret?: string;
}
export class ProviderEnabledDto {
  @IsBoolean() enabled: boolean;
}
export class OidcBrowserDto {
  @Matches(/^[a-zA-Z0-9_-]{43,128}$/) browser_key: string;
}
export class OidcLoginDto extends OidcBrowserDto {
  @IsString() @Length(1, 120) company: string;
}
export class ConfirmPasswordDto {
  @IsString() @Length(1, 256) password: string;
}
export class OidcLinkDto extends OidcBrowserDto {
  @IsString() @Length(1, 256) password: string;
}
export class OidcCallbackDto extends OidcBrowserDto {
  @IsString() @Length(20, 256) state: string;
  @IsString() @Length(1, 8192) code: string;
  @IsOptional() @IsString() @MaxLength(512) iss?: string;
}
