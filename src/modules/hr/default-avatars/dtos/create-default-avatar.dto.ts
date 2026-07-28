import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Base64FileDto } from '../../../files/dtos/base64-file.dto';
import { DefaultAvatarGenderEnum } from '../enums/default-avatar-gender.enum';
import { DefaultAvatarStatusEnum } from '../enums/default-avatar-status.enum';

export class CreateDefaultAvatarDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  avatar_name: string;

  @ApiProperty({ enum: DefaultAvatarGenderEnum })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEnum(DefaultAvatarGenderEnum)
  gender_category: DefaultAvatarGenderEnum;

  @ApiPropertyOptional({ enum: DefaultAvatarStatusEnum })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEnum(DefaultAvatarStatusEnum)
  @IsOptional()
  status?: DefaultAvatarStatusEnum;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  display_order?: number;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_default?: boolean;

  @ApiProperty({ type: Base64FileDto })
  @IsObject()
  @ValidateNested()
  @Type(() => Base64FileDto)
  image_file: Base64FileDto;
}
