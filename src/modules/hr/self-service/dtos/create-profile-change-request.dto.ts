import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ProfileChangeRequestTypeEnum } from '../enums/profile-change-request-type.enum';

export class CreateProfileChangeRequestDto {
  @ApiProperty({ enum: ProfileChangeRequestTypeEnum })
  @IsEnum(ProfileChangeRequestTypeEnum)
  request_type: ProfileChangeRequestTypeEnum;

  @ApiPropertyOptional({
    example: {
      phone: '+255712000111',
      city: 'Dar es Salaam',
    },
  })
  @IsOptional()
  @IsObject()
  changes?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'Updated my phone number and home city.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}
