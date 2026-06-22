import { OmitType } from '@nestjs/swagger';
import { CreateAttendanceMobilePunchDto } from '../../attendance/mobile-punches/dtos/create-attendance-mobile-punch.dto';

export class CreateMyAttendancePunchDto extends OmitType(
  CreateAttendanceMobilePunchDto,
  ['employeeId'] as const,
) {}