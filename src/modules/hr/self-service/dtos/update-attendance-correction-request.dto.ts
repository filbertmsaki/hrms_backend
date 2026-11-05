import { PartialType } from '@nestjs/swagger';
import { CreateAttendanceCorrectionRequestDto } from './create-attendance-correction-request.dto';

export class UpdateAttendanceCorrectionRequestDto extends PartialType(
  CreateAttendanceCorrectionRequestDto,
) {}
