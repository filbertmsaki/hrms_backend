import { PartialType } from '@nestjs/swagger';
import { CreateProfileUpdateRequestDto } from './create-profile-update-request.dto';

export class UpdateMyProfileUpdateRequestDto extends PartialType(
  CreateProfileUpdateRequestDto,
) {}
