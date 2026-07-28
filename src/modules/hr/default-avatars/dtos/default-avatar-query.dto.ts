import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { DefaultAvatarGenderEnum } from '../enums/default-avatar-gender.enum';
import { DefaultAvatarStatusEnum } from '../enums/default-avatar-status.enum';

export class DefaultAvatarQueryDto {
  @ApiPropertyOptional({ enum: DefaultAvatarGenderEnum })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEnum(DefaultAvatarGenderEnum)
  @IsOptional()
  gender_category?: DefaultAvatarGenderEnum;

  @ApiPropertyOptional({ enum: DefaultAvatarStatusEnum })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEnum(DefaultAvatarStatusEnum)
  @IsOptional()
  status?: DefaultAvatarStatusEnum;

  @ApiPropertyOptional({
    description: 'Include inactive avatars in the response.',
  })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  include_inactive?: boolean;
}
