import { PartialType } from '@nestjs/mapped-types';
import { CreateHolidayGroupDto } from './create-holiday-group.dto';

export class UpdateHolidayGroupDto extends PartialType(CreateHolidayGroupDto) {}
