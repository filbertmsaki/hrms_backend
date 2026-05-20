import { PartialType } from '@nestjs/mapped-types';
import { CreateAttendanceCheckpointDto } from './create-attendance-checkpoint.dto';

export class UpdateAttendanceCheckpointDto extends PartialType(CreateAttendanceCheckpointDto) {}




