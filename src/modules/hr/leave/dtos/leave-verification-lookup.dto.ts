import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class LeaveVerificationLookupDto {
  @ApiProperty({ description: 'Token from the leave PDF QR code' })
  @IsString()
  @MaxLength(64)
  token: string;
}
