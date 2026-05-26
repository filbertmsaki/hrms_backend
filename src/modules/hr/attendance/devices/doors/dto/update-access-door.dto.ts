import { PartialType } from '@nestjs/mapped-types';
import { CreateAccessDoorDto } from './create-access-door.dto';

export class UpdateAccessDoorDto extends PartialType(CreateAccessDoorDto) {}

