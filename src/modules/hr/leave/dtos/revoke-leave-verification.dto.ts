import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RevokeLeaveVerificationDto {
  @ApiProperty({
    description: 'Why the QR verification code is being withdrawn (audited)',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
