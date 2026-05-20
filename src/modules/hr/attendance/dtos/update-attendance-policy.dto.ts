import { PartialType } from '@nestjs/mapped-types';
import { CreateAttendancePolicyDto } from './create-attendance-policy.dto';

export class UpdateAttendancePolicyDto extends PartialType(CreateAttendancePolicyDto) {}