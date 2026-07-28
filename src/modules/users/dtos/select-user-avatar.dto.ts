import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class SelectUserAvatarDto {
  @ApiProperty({
    description: 'Selected default avatar id.',
    example: 3,
  })
  @Type(() => Number)
  @IsInt()
  avatar_id: number;
}
