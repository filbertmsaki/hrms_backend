import { PartialType } from '@nestjs/mapped-types';
import { CreateDefaultAvatarDto } from './create-default-avatar.dto';

export class UpdateDefaultAvatarDto extends PartialType(CreateDefaultAvatarDto) {}
