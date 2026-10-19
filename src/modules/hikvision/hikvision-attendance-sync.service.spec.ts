import { Logger } from '@nestjs/common';
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
import { AttendanceEmployeeResolverService } from '../hr/attendance/processing/attendance-employee-resolver.service';
import { AttendanceRecalculationService } from '../hr/attendance/processing/attendance-recalculation.service';
import { AttendanceRecalculationJob } from '../hr/attendance/processing/entities/attendance-recalculation-job.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { HikvisionAttendanceSyncService } from './hikvision-attendance-sync.service';
import { HikvisionAttendanceLog } from './entities/hikvision-attendance-log.entity';
import { HikvisionAttendanceSyncJob } from './entities/hikvision-attendance-sync-job.entity';
import { HikvisionAccessControlService } from './hikvision-access-control.service';
import { HikvisionHelperService } from './helpers/hikvision-helper.service';
import { HikvisionSyncJobData } from './hikvision-sync-job.constants';

interface HikvisionAttendanceSyncServiceInternals {
  isValidPunchEvent(event: Record<string, unknown>): boolean;
  persistAttendanceEvents(
    device: AttendanceDevice,
    events: Record<string, unknown>[],
  ): Promise<{
    received: number;
    validPunchRecords: number;
    skippedSystemEvents: number;
    created: number;
    skipped: number;
    failed: number;
    updated: number;
    unmappedEmployees: number;
  }>;
  buildAttendanceEventKey(
    deviceId: number,
    employeeNoString: string,
    time: Date,
    major: number,
    minor: number,
    serialNo: string | null,
    door: number,
  ): string;
  buildAttendanceSyncQueueJobId(
    syncJobId: number,
    companyId: number,
    deviceId: number,
    createdAt: Date,
  ): string;
  doesQueueJobMatchAttendanceSyncRecord(
    syncJob: HikvisionAttendanceSyncJob,
    queueData: HikvisionSyncJobData,
  ): boolean;
  syncByCondition(
    companyId: number,
    device: AttendanceDevice,
    condition: Record<string, unknown>,
    options: Record<string, unknown>,
  ): Promise<{
    totalMatches: number;
    totalFetched: number;
    inserted: number;
    duplicatesSkipped: number;
    status: string;
  }>;
  resolveEmployeeMappings(
    companyId: number,
    deviceId: number,
    employeeNumbers: string[],
  ): Promise<Map<string, number>>;
  mapEventToRow(
    device: AttendanceDevice,
    item: Record<string, unknown>,
    employeeId: number | null,
  ): Record<string, unknown>;
}

describe('HikvisionAttendanceSyncService', () => {
  let service: HikvisionAttendanceSyncService;
  let internals: HikvisionAttendanceSyncServiceInternals;
  let attendanceLogRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let attendanceEmployeeResolver: {
    resolveEmployeeId: jest.Mock;
  };
  let attendanceRecalculationService: {
    executeJob: jest.Mock;
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    attendanceLogRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((value: Partial<HikvisionAttendanceLog>) => value),
    };
    attendanceEmployeeResolver = {
      resolveEmployeeId: jest.fn(),
    };
    attendanceRecalculationService = {
      executeJob: jest.fn(),
    };
    service = new HikvisionAttendanceSyncService(
      {} as Repository<AttendanceDevice>,
      attendanceLogRepository as unknown as Repository<HikvisionAttendanceLog>,
      {} as Repository<Employee>,
      {} as Repository<AttendanceRecalculationJob>,
      {} as Repository<HikvisionAttendanceSyncJob>,
      {} as Repository<HikvisionSyncLog>,
      {} as Queue<HikvisionSyncJobData>,
      {} as HikvisionAccessControlService,
      {} as HikvisionHelperService,
      attendanceEmployeeResolver as unknown as AttendanceEmployeeResolverService,
      attendanceRecalculationService as unknown as AttendanceRecalculationService,
    );
    internals = service as unknown as HikvisionAttendanceSyncServiceInternals;
  });

  it('skips anonymous unknown attendance events', () => {
    const result = internals.isValidPunchEvent({
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
    const result = internals.isValidPunchEvent({
      major: 5,
      minor: 21,
      time: '2026-06-26T12:03:16+03:00',
      employeeNoString: '00000016',
    });

    expect(result).toBe(true);
  });

  it('keeps supported attendance minor codes', () => {
    const result = internals.isValidPunchEvent({
      major: 5,
      minor: 38,
      time: '2026-06-26T11:27:28+03:00',
    });

    expect(result).toBe(true);
  });

  it('builds the preferred dedupe key from device id and serial number', () => {
    const result = internals.buildAttendanceEventKey(
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
    const result = internals.buildAttendanceEventKey(
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

  it('builds queue job ids with the sync job timestamp to avoid collisions after database resets', () => {
    const result = internals.buildAttendanceSyncQueueJobId(
      1,
      1,
      2,
      new Date('2026-06-27T07:03:47.624Z'),
    );

    expect(result).toBe('attendance-sync-1-1-2-1782543827624');
  });

  it('detects mismatched Bull job payloads so stale DB locks can be released', () => {
    const syncJob = {
      id: 2,
      companyId: 1,
      deviceId: 1,
      syncStartTime: '2026-06-27T00:00:00+03:00',
      syncEndTime: '2026-06-27T23:59:59+03:00',
      metadata: {
        maxResults: 100,
        employeeNo: null,
      },
    } as unknown as HikvisionAttendanceSyncJob;

    const queueData: HikvisionSyncJobData = {
      companyId: 1,
      deviceId: 1,
      requestedByUserId: 2,
      requestedByCompanyUserId: null,
      requestedAt: '2026-06-26T12:37:41.501Z',
      attendanceSyncJobId: 2,
      attendanceStartTime: '2026-06-23T00:00:00+03:00',
      attendanceEndTime: '2026-06-24T23:59:59+03:00',
      attendanceMaxResults: 3,
    };

    const result = internals.doesQueueJobMatchAttendanceSyncRecord(
      syncJob,
      queueData,
    );

    expect(result).toBe(false);
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
        (
          _companyId: number,
          _deviceId: number,
          payload: { AcsEventCond: { searchResultPosition: number } },
        ) => {
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
        (
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

    const result = await internals.syncByCondition(
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

  it('retains unmapped attendance events so employee mappings can be repaired later', async () => {
    const device = {
      id: 44,
      companyId: 7,
      branchId: 2,
    } as AttendanceDevice;
    jest.spyOn(service as any, 'mapEventsToRows').mockResolvedValue([
      {
        companyId: 7,
        branchId: 2,
        deviceId: 44,
        employeeId: null,
        isEmployeeMapped: false,
        employeeNo: 'DEV-404',
        employeeName: null,
        cardNo: null,
        eventTime: new Date('2026-07-24T08:00:00.000Z'),
        major: 5,
        minor: 38,
        eventType: 'VALID_FINGERPRINT_OR_CARD_OR_PASSWORD_ACCESS',
        attendanceStatus: null,
        verifyMode: null,
        doorNo: 1,
        cardReaderNo: 1,
        cardReaderKind: '0',
        serialNo: 'SER-404',
        deviceTime: new Date('2026-07-24T08:00:00.000Z'),
        deviceNo: '0',
        remoteHostAddr: '0.0.0.0',
        netUser: null,
        userType: 'normal',
        statusValue: 0,
        eventKey: 'device:44:serial:SER-404',
        processingStatus: 'UNMATCHED_EMPLOYEE',
        rawPayload: {
          employeeNoString: 'DEV-404',
          time: '2026-07-24T11:00:00+03:00',
        },
      },
    ]);
    attendanceLogRepository.find.mockResolvedValue([]);

    const result = await internals.persistAttendanceEvents(device, [
      {
        employeeNoString: 'DEV-404',
        time: '2026-07-24T11:00:00+03:00',
      },
    ]);

    expect(result).toEqual({
      received: 1,
      validPunchRecords: 1,
      skippedSystemEvents: 0,
      created: 1,
      skipped: 0,
      failed: 0,
      updated: 0,
      unmappedEmployees: 1,
    });
    expect(attendanceLogRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: null,
        isEmployeeMapped: false,
        processingStatus: 'UNMATCHED_EMPLOYEE',
        rawPayload: expect.objectContaining({ employeeNoString: 'DEV-404' }),
      }),
    );
  });

  it('returns a retained unmapped event to pending when its employee is resolved', async () => {
    const existing = {
      isEmployeeMapped: false,
      employeeId: null,
      employeeNo: 'DEV-404',
      processingStatus: 'UNMATCHED_EMPLOYEE',
      processedAt: new Date('2026-07-24T09:00:00.000Z'),
      lastProcessingError: 'Employee identity not found',
    };
    const mapped = {
      employeeId: 77,
      isEmployeeMapped: true,
      employeeNo: 'DEV-404',
    };

    const changed = await (service as any).applyAttendanceLogChanges(
      existing,
      mapped,
    );

    expect(changed).toBe(true);
    expect(existing).toEqual(
      expect.objectContaining({
        employeeId: 77,
        isEmployeeMapped: true,
        processingStatus: 'PENDING',
        processedAt: null,
        lastProcessingError: null,
      }),
    );
    expect(attendanceLogRepository.save).toHaveBeenCalledWith(existing);
  });

  it('filters non-attendance major events before persisting logs', async () => {
    const device = { id: 44, companyId: 7, branchId: 2 } as AttendanceDevice;
    const mapEvents = jest.spyOn(service as any, 'mapEventsToRows');

    const result = await internals.persistAttendanceEvents(device, [
      {
        major: 3,
        minor: 1,
        employeeNoString: 'EMP-001',
        time: '2026-07-24T11:00:00+03:00',
      },
    ]);

    expect(result).toEqual({
      received: 1,
      validPunchRecords: 0,
      skippedSystemEvents: 1,
      created: 0,
      skipped: 0,
      failed: 0,
      updated: 0,
      unmappedEmployees: 0,
    });
    expect(mapEvents).not.toHaveBeenCalled();
    expect(attendanceLogRepository.save).not.toHaveBeenCalled();
  });

  it('interprets offset-free device event times in the configured device timezone', () => {
    const result = internals.mapEventToRow(
      {
        id: 44,
        companyId: 7,
        branchId: 2,
        timezone: 'Africa/Dar_es_Salaam',
      } as AttendanceDevice,
      {
        major: 5,
        minor: 38,
        employeeNoString: 'EMP-001',
        time: '2026-07-24T11:00:00',
      },
      101,
    );

    expect(result.eventTime).toEqual(new Date('2026-07-24T08:00:00.000Z'));
    expect(result.deviceTime).toEqual(new Date('2026-07-24T08:00:00.000Z'));
  });

  it('retries transient Hikvision HTTP errors but returns non-retryable errors immediately', async () => {
    const searchAcsEvents = jest
      .fn()
      .mockResolvedValueOnce({ status: 503, ok: false, parsed: {} })
      .mockResolvedValueOnce({ status: 200, ok: true, parsed: {} });
    (service as any).hikvisionAccessControlService = { searchAcsEvents };

    const result = await (service as any).requestAcsEventsWithRetry(
      7,
      44,
      { AcsEventCond: {} },
      1,
    );

    expect(result.status).toBe(200);
    expect(searchAcsEvents).toHaveBeenCalledTimes(2);

    searchAcsEvents.mockReset().mockResolvedValue({
      status: 401,
      ok: false,
      parsed: {},
    });
    await (service as any).requestAcsEventsWithRetry(
      7,
      44,
      { AcsEventCond: {} },
      2,
    );
    expect(searchAcsEvents).toHaveBeenCalledTimes(1);
  });

  it('resolves attendance employee numbers through the device assignment resolver before falling back to employee_no', async () => {
    attendanceEmployeeResolver.resolveEmployeeId
      .mockResolvedValueOnce({ employeeId: 41, reason: 'ASSIGNMENT_MAP' })
      .mockResolvedValueOnce({ employeeId: null, reason: 'IDENTITY_NOT_FOUND' })
      .mockResolvedValueOnce({ employeeId: 77, reason: 'EMPLOYEE_NO_MATCH' });

    const result = await internals.resolveEmployeeMappings(7, 44, [
      'DEV-001',
      'DEV-404',
      'EMP-077',
    ]);

    expect(
      attendanceEmployeeResolver.resolveEmployeeId,
    ).toHaveBeenNthCalledWith(1, 7, 'DEV-001', 44);
    expect(
      attendanceEmployeeResolver.resolveEmployeeId,
    ).toHaveBeenNthCalledWith(2, 7, 'DEV-404', 44);
    expect(
      attendanceEmployeeResolver.resolveEmployeeId,
    ).toHaveBeenNthCalledWith(3, 7, 'EMP-077', 44);
    expect([...result.entries()]).toEqual([
      ['DEV-001', 41],
      ['EMP-077', 77],
    ]);
  });
});
