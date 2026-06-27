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
import { AttendanceRecalculationJob } from '../hr/attendance/processing/entities/attendance-recalculation-job.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
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
      {} as Repository<Employee>,
      {} as Repository<AttendanceRecalculationJob>,
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

  it('builds the preferred dedupe key from device id and serial number', () => {
    const result = (service as any).buildAttendanceEventKey(
      12,
      '00000001',
      new Date('2026-05-25T08:30:00+03:00'),
      5,
      1,
      'ABC-123',
      2,
    );

    expect(result).toBe('device:12:serial:ABC-123');
  });

  it('falls back to device, employee, time, major, minor, and door for dedupe when serial number is missing', () => {
    const result = (service as any).buildAttendanceEventKey(
      12,
      '00000001',
      new Date('2026-05-25T08:30:00+03:00'),
      5,
      1,
      null,
      2,
    );

    expect(result).toBe(
      'device:12|employee:00000001|time:2026-05-25T05:30:00.000Z|major:5|minor:1|door:2',
    );
  });

  it('paginates until Hikvision stops returning MORE', async () => {
    const device = {
      id: 44,
      companyId: 7,
      branchId: null,
    } as AttendanceDevice;
    const requestedPositions: number[] = [];

    jest.spyOn(service as any, 'normalizeCondition').mockResolvedValue({
      searchID: 'attendance_sync',
      searchResultPosition: 0,
      maxResults: 100,
      major: 5,
      minor: 0,
      startTime: '2026-05-25T00:00:00+03:00',
      endTime: '2026-05-26T23:59:59+03:00',
    });
    jest.spyOn(service as any, 'fetchTotalMatchesHint').mockResolvedValue(null);
    jest
      .spyOn(service as any, 'requestAcsEventsWithRetry')
      .mockImplementation(
        async (_companyId: number, _deviceId: number, payload: any) => {
          requestedPositions.push(payload.AcsEventCond.searchResultPosition);

          const position = payload.AcsEventCond.searchResultPosition;
          if (position === 0) {
            return {
              ok: true,
              status: 200,
              raw: '{}',
              parsed: {
                AcsEvent: {
                  searchID: 'attendance_sync',
                  responseStatusStrg: 'MORE',
                  numOfMatches: 100,
                  totalMatches: 232,
                  InfoList: Array.from({ length: 100 }, (_, index) => ({
                    serialNo: `S-${index + 1}`,
                  })),
                },
              },
            };
          }

          if (position === 100) {
            return {
              ok: true,
              status: 200,
              raw: '{}',
              parsed: {
                AcsEvent: {
                  searchID: 'attendance_sync',
                  responseStatusStrg: 'MORE',
                  numOfMatches: 100,
                  totalMatches: 232,
                  InfoList: Array.from({ length: 100 }, (_, index) => ({
                    serialNo: `S-${index + 101}`,
                  })),
                },
              },
            };
          }

          return {
            ok: true,
            status: 200,
            raw: '{}',
            parsed: {
              AcsEvent: {
                searchID: 'attendance_sync',
                responseStatusStrg: 'OK',
                numOfMatches: 32,
                totalMatches: 232,
                InfoList: Array.from({ length: 32 }, (_, index) => ({
                  serialNo: `S-${index + 201}`,
                })),
              },
            },
          };
        },
      );
    jest
      .spyOn(service as any, 'persistAttendanceEvents')
      .mockImplementation(
        async (
          _device: AttendanceDevice,
          events: Array<Record<string, unknown>>,
        ) => ({
          received: events.length,
          validPunchRecords: events.length,
          skippedSystemEvents: 0,
          created: events.length,
          skipped: 0,
          failed: 0,
          updated: 0,
          unmappedEmployees: 0,
        }),
      );
    jest
      .spyOn(service as any, 'persistSyncLogSafe')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'markDeviceAttendanceSynced')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'queueAttendanceProcessingRecalculation')
      .mockResolvedValue(undefined);

    const result = await (service as any).syncByCondition(
      7,
      device,
      {
        searchID: 'attendance_sync',
        searchResultPosition: 0,
        maxResults: 100,
        startTime: '2026-05-25T00:00:00+03:00',
        endTime: '2026-05-26T23:59:59+03:00',
      },
      {
        trigger: 'MANUAL',
        updateSyncCursor: true,
      },
    );

    expect(requestedPositions).toEqual([0, 100, 200]);
    expect(result.totalMatches).toBe(232);
    expect(result.totalFetched).toBe(232);
    expect(result.inserted).toBe(232);
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.status).toBe('SUCCESS');
  });
});
