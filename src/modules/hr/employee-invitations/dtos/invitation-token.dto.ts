import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AcceptEmployeeInvitationDto } from './accept-employee-invitation.dto';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

// The registration token travels in the request body rather than the URL so
// it never lands in proxy, load-balancer or access logs.
export class InvitationTokenDto {
  @ApiProperty({ description: 'Registration token from the invitation link' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;
}

export class AcceptEmployeeInvitationWithTokenDto extends AcceptEmployeeInvitationDto {
  @ApiProperty({ description: 'Registration token from the invitation link' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;
}
