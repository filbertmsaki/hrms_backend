import { PartialType } from '@nestjs/mapped-types';
import { CreateAttendanceSettingDto } from './create-attendance-setting.dto';

export class UpdateAttendanceSettingDto extends PartialType(CreateAttendanceSettingDto) {}




