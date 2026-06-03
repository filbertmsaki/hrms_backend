import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SetEmployeeDevicePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  password: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  user_verify_mode?: string;
}
