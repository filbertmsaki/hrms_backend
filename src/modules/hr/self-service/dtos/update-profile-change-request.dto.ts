import { PartialType } from '@nestjs/swagger';
import { CreateProfileChangeRequestDto } from './create-profile-change-request.dto';

export class UpdateProfileChangeRequestDto extends PartialType(
  CreateProfileChangeRequestDto,
) {}
