import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AcceptEmployeeInvitationDto {
  // New accounts must choose a strong password; invitees who already have an
  // account confirm with their current password instead. The strength rule is
  // therefore enforced in the service once we know which case applies.
  @ApiProperty({ example: 'StrongPass#2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
