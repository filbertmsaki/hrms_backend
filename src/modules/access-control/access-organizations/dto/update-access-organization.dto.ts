import { PartialType } from '@nestjs/mapped-types';
import { CreateAccessOrganizationDto } from './create-access-organization.dto';

export class UpdateAccessOrganizationDto extends PartialType(
  CreateAccessOrganizationDto,
) {}
