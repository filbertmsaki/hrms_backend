import { Injectable } from '@nestjs/common';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceProcessedEventDirectionEnum } from './enums/attendance-processed-event-direction.enum';

@Injectable()
export class AttendanceEventDirectionResolverService {
  resolveHikvision(
    rawLog: Pick<HikvisionAttendanceLog, 'minor' | 'attendanceStatus'>,
  ): AttendanceProcessedEventDirectionEnum {
    switch (rawLog.minor) {
      case 1:
      case 75:
        return AttendanceProcessedEventDirectionEnum.IN;
      case 2:
      case 76:
        return AttendanceProcessedEventDirectionEnum.OUT;
      case 3:
        return AttendanceProcessedEventDirectionEnum.BREAK_OUT;
      case 4:
        return AttendanceProcessedEventDirectionEnum.BREAK_IN;
      default:
        return this.resolveStatus(rawLog.attendanceStatus);
    }
  }

  private resolveStatus(
    statusValue: string | null | undefined,
  ): AttendanceProcessedEventDirectionEnum {
    const status = (statusValue ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]/g, '');

    if (status.includes('breakstart') || status.includes('breakout')) {
      return AttendanceProcessedEventDirectionEnum.BREAK_OUT;
    }

    if (status.includes('breakend') || status.includes('breakin')) {
      return AttendanceProcessedEventDirectionEnum.BREAK_IN;
    }

    if (status.includes('checkin') || status === 'in') {
      return AttendanceProcessedEventDirectionEnum.IN;
    }

    if (status.includes('checkout') || status === 'out') {
      return AttendanceProcessedEventDirectionEnum.OUT;
    }

    return AttendanceProcessedEventDirectionEnum.UNKNOWN;
  }
}
