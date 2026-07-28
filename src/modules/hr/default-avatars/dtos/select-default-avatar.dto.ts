import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class SelectDefaultAvatarDto {
  @ApiPropertyOptional({
    description:
      'Selected default avatar id. Pass null or omit to clear the selection.',
    nullable: true,
  })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  default_avatar_id?: number | null;
}
