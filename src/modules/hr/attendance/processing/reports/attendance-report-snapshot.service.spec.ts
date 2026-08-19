import { AttendanceReportSnapshotService } from './attendance-report-snapshot.service';

function buildQueryBuilderMock(rawRows: unknown[]) {
  const qb: Record<string, jest.Mock> = {};
  const chainable = [
    'leftJoin',
    'where',
    'andWhere',
    'select',
    'addSelect',
    'orderBy',
  ];
  for (const method of chainable) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  qb.getRawMany = jest.fn().mockResolvedValue(rawRows);
  return qb;
}

describe('AttendanceReportSnapshotService', () => {
  function buildService(
    employeeRows: unknown[],
    exceptionRows: unknown[] = [],
  ) {
    const employeeQb = buildQueryBuilderMock(employeeRows);
    const exceptionQb = buildQueryBuilderMock(exceptionRows);

    const employeeRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(employeeQb),
    } as never;
    const exceptionRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(exceptionQb),
    } as never;

    return new AttendanceReportSnapshotService(
      employeeRepository,
      exceptionRepository,
    );
  }

  function row(overrides: Record<string, unknown>) {
    return {
      employeeId: 1,
      employeeNumber: 'EMP-001',
      employeeFirstName: 'Jane',
      employeeMiddleName: null,
      employeeLastName: 'Doe',
      departmentName: 'Finance',
      branchName: 'HQ',
      positionName: 'Accountant',
      checkInAt: null,
      checkOutAt: null,
      timezone: 'Africa/Dar_es_Salaam',
      attendanceStatus: null,
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      workMinutes: 0,
      ...overrides,
    };
  }

  it('counts a present, on-time employee as expected/present/checked-in', async () => {
    const service = buildService([
      row({
        attendanceStatus: 'PRESENT',
        checkInAt: '2026-08-18T05:00:00.000Z',
        checkOutAt: '2026-08-18T14:00:00.000Z',
      }),
    ]);

    const snapshot = await service.buildSnapshot(1, '2026-08-18');

    expect(snapshot.totals).toMatchObject({
      expected: 1,
      present: 1,
      absent: 0,
      onLeave: 0,
      notYetCheckedIn: 0,
      late: 0,
      missingCheckOut: 0,
      checkedOut: 1,
    });
  });

  it('flags a late employee without double counting as absent', async () => {
    const service = buildService([
      row({
        attendanceStatus: 'LATE',
        checkInAt: '2026-08-18T06:10:00.000Z',
      }),
    ]);

    const snapshot = await service.buildSnapshot(1, '2026-08-18');

    expect(snapshot.totals.late).toBe(1);
    expect(snapshot.totals.present).toBe(1);
    expect(snapshot.totals.absent).toBe(0);
  });

  it('does not count an employee on approved leave as absent', async () => {
    const service = buildService([row({ attendanceStatus: 'ANNUAL_LEAVE' })]);

    const snapshot = await service.buildSnapshot(1, '2026-08-18');

    expect(snapshot.totals.onLeave).toBe(1);
    expect(snapshot.totals.absent).toBe(0);
    expect(snapshot.totals.notYetCheckedIn).toBe(0);
    expect(snapshot.rows[0].leaveTypeLabel).toBe('Annual Leave');
  });

  it('counts a genuinely absent employee once', async () => {
    const service = buildService([row({ attendanceStatus: 'ABSENT' })]);

    const snapshot = await service.buildSnapshot(1, '2026-08-18');

    expect(snapshot.totals.absent).toBe(1);
    expect(snapshot.totals.notYetCheckedIn).toBe(0);
    expect(snapshot.totals.expected).toBe(1);
  });

  it('treats an employee with no summary row yet as expected and not-yet-checked-in, never absent', async () => {
    const service = buildService([row({ attendanceStatus: null })]);

    const snapshot = await service.buildSnapshot(1, '2026-08-18');

    expect(snapshot.rows[0].attendanceStatus).toBe('PENDING');
    expect(snapshot.totals.expected).toBe(1);
    expect(snapshot.totals.notYetCheckedIn).toBe(1);
    expect(snapshot.totals.absent).toBe(0);
  });

  it('flags a missing checkout only when a checkout was actually required', async () => {
    const service = buildService([
      row({
        attendanceStatus: 'PRESENT',
        checkInAt: '2026-08-18T05:00:00.000Z',
        checkOutAt: null,
      }),
    ]);

    const snapshot = await service.buildSnapshot(1, '2026-08-18');

    expect(snapshot.totals.missingCheckOut).toBe(1);
  });

  it('excludes off-day, holiday, and no-shift employees from the expected count', async () => {
    const service = buildService([
      row({ employeeId: 1, attendanceStatus: 'OFF_DAY' }),
      row({ employeeId: 2, attendanceStatus: 'HOLIDAY' }),
      row({ employeeId: 3, attendanceStatus: 'NO_SHIFT_SCHEDULE' }),
    ]);

    const snapshot = await service.buildSnapshot(1, '2026-08-18');

    expect(snapshot.totals.expected).toBe(0);
    expect(snapshot.totals.absent).toBe(0);
    expect(snapshot.totals.notYetCheckedIn).toBe(0);
  });

  it('attaches exception labels to the matching employee row', async () => {
    const service = buildService(
      [row({ employeeId: 7, attendanceStatus: 'PRESENT' })],
      [
        {
          employeeId: 7,
          exceptionType: 'DEVICE_MISMATCH',
          message: 'Unrecognized device punch',
        },
      ],
    );

    const snapshot = await service.buildSnapshot(1, '2026-08-18');

    expect(snapshot.rows[0].exceptions).toEqual(['Unrecognized device punch']);
  });
});
