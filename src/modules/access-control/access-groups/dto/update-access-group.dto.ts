import { PartialType } from '@nestjs/mapped-types';
import { CreateAccessGroupDto } from './create-access-group.dto';

export class UpdateAccessGroupDto extends PartialType(CreateAccessGroupDto) {}
