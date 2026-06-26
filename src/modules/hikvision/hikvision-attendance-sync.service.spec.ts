jest.mock('./hikvision-access-control.service', () => ({
  HikvisionAccessControlService: class HikvisionAccessControlService {},
}));

jest.mock('./helpers/hikvision-helper.service', () => ({
  HikvisionHelperService: class HikvisionHelperService {},
}));

import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { AttendanceDevice } from '../access-control/attendance-devices/entities/attendance-device.entity';
import { HikvisionSyncLog } from '../access-control/hikvision-sync-logs/entity/hikvision-sync-log.entity';
import { HikvisionAttendanceSyncService } from './hikvision-attendance-sync.service';
import { HikvisionAttendanceLog } from './entities/hikvision-attendance-log.entity';
import { HikvisionAttendanceSyncJob } from './entities/hikvision-attendance-sync-job.entity';
import { HikvisionAccessControlService } from './hikvision-access-control.service';
import { HikvisionHelperService } from './helpers/hikvision-helper.service';

describe('HikvisionAttendanceSyncService', () => {
  let service: HikvisionAttendanceSyncService;

  beforeEach(() => {
    service = new HikvisionAttendanceSyncService(
      {} as Repository<AttendanceDevice>,
      {} as Repository<HikvisionAttendanceLog>,
      {} as Repository<HikvisionAttendanceSyncJob>,
      {} as Repository<HikvisionSyncLog>,
      {} as Queue,
      {} as HikvisionAccessControlService,
      {} as HikvisionHelperService,
    );
  });

  it('skips anonymous unknown attendance events', () => {
    const result = (service as any).isValidPunchEvent({
      major: 5,
      minor: 21,
      time: '2026-06-26T12:03:16+03:00',
      employeeNoString: '',
      employeeNo: '',
      empNo: '',
      employeeId: '',
      cardNo: '',
      name: '',
      employeeName: '',
    });

    expect(result).toBe(false);
  });

  it('keeps employee-identified attendance events even when the minor code is uncommon', () => {
    const result = (service as any).isValidPunchEvent({
      major: 5,
      minor: 21,
      time: '2026-06-26T12:03:16+03:00',
      employeeNoString: '00000016',
    });

    expect(result).toBe(true);
  });

  it('keeps supported attendance minor codes', () => {
    const result = (service as any).isValidPunchEvent({
      major: 5,
      minor: 38,
      time: '2026-06-26T11:27:28+03:00',
    });

    expect(result).toBe(true);
  });
});
