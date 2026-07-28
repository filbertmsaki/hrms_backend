import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminDisableUser2FADto {
  @ApiPropertyOptional({
    description: 'Optional reason for disabling two-factor authentication.',
    example: 'User lost access to the authenticator device',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
