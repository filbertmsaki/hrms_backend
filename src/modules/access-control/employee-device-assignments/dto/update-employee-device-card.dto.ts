import { PartialType } from '@nestjs/mapped-types';
import { CreateEmployeeDeviceCardDto } from './create-employee-device-card.dto';

export class UpdateEmployeeDeviceCardDto extends PartialType(
  CreateEmployeeDeviceCardDto,
) {}
