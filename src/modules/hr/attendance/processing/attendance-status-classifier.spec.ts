import {
  AttendanceStatusClassifierInput,
  classifyAttendanceStatuses,
} from './attendance-status-classifier';
import { AttendanceDailyStatusEnum as L } from './enums/attendance-daily-status.enum';

// Schedule 08:15–17:15, 30-minute arrival grace (spec section 5).
const at = (hhmm: string | null) =>
  hhmm ? new Date(`2026-11-20T${hhmm}:00.000Z`) : null;

const base = (
  overrides: Partial<AttendanceStatusClassifierInput>,
): AttendanceStatusClassifierInput => ({
  legacyStatus: L.PRESENT,
  checkInAt: null,
  checkOutAt: null,
  scheduleStartAt: at('08:15'),
  scheduleEndAt: at('17:15'),
  graceInMinutes: 30,
  lateAfterMinutes: 0,
  graceOutMinutes: 0,
  earlyLeaveAfterMinutes: 0,
  requiresCheckout: true,
  autoAbsentIfNoCheckin: true,
  cutoffPassed: true,
  hasInvalidPunches: false,
  attendanceExempt: false,
  ...overrides,
});

describe('classifyAttendanceStatuses — spec matrix', () => {
  const cases: Array<
    [
      string,
      string | null,
      string | null,
      Partial<AttendanceStatusClassifierInput>,
      [string, string, string, string, boolean],
    ]
  > = [
    [
      'early arrival',
      '08:00',
      '17:15',
      {},
      ['PRESENT', 'COMPLETE', 'EARLY_ARRIVAL', 'ON_TIME', false],
    ],
    [
      'on time',
      '08:15',
      '17:15',
      {},
      ['PRESENT', 'COMPLETE', 'ON_TIME', 'ON_TIME', false],
    ],
    [
      'within grace',
      '08:30',
      '17:15',
      {},
      ['PRESENT', 'COMPLETE', 'ON_TIME', 'ON_TIME', false],
    ],
    [
      'late',
      '08:50',
      '17:15',
      { legacyStatus: L.LATE },
      ['PRESENT', 'COMPLETE', 'LATE', 'ON_TIME', false],
    ],
    [
      'late + early',
      '08:50',
      '16:30',
      { legacyStatus: L.LATE_AND_EARLY_DEPARTURE },
      ['PRESENT', 'COMPLETE', 'LATE', 'EARLY_DEPARTURE', false],
    ],
    [
      'late departure',
      '08:15',
      '18:00',
      { legacyStatus: L.OVERTIME },
      ['PRESENT', 'COMPLETE', 'ON_TIME', 'LATE_DEPARTURE', false],
    ],
    [
      'late, no checkout',
      '08:50',
      null,
      {},
      ['PRESENT', 'MISSING_CHECK_OUT', 'LATE', 'UNKNOWN', true],
    ],
    [
      'on time, no checkout',
      '08:15',
      null,
      {},
      ['PRESENT', 'MISSING_CHECK_OUT', 'ON_TIME', 'UNKNOWN', true],
    ],
    [
      'no checkin, on-time out',
      null,
      '17:15',
      {},
      ['PRESENT', 'MISSING_CHECK_IN', 'UNKNOWN', 'ON_TIME', true],
    ],
    [
      'no checkin, early out',
      null,
      '16:30',
      {},
      ['PRESENT', 'MISSING_CHECK_IN', 'UNKNOWN', 'EARLY_DEPARTURE', true],
    ],
    [
      'no punches',
      null,
      null,
      { legacyStatus: L.ABSENT },
      ['ABSENT', 'MISSING_BOTH', 'UNKNOWN', 'UNKNOWN', false],
    ],
    [
      'in progress',
      '08:15',
      null,
      { cutoffPassed: false },
      ['PRESENT', 'IN_PROGRESS', 'ON_TIME', 'NOT_YET_CHECKED_OUT', true],
    ],
    [
      'annual leave',
      null,
      null,
      { legacyStatus: L.ANNUAL_LEAVE },
      ['LEAVE', 'NOT_REQUIRED', 'NOT_APPLICABLE', 'NOT_APPLICABLE', false],
    ],
    [
      'off day',
      null,
      null,
      { legacyStatus: L.OFF_DAY },
      ['OFF_DAY', 'NOT_REQUIRED', 'NOT_APPLICABLE', 'NOT_APPLICABLE', false],
    ],
    [
      'holiday',
      null,
      null,
      { legacyStatus: L.HOLIDAY },
      ['HOLIDAY', 'NOT_REQUIRED', 'NOT_APPLICABLE', 'NOT_APPLICABLE', false],
    ],
  ];

  it.each(cases)('%s', (_name, inAt, outAt, overrides, expected) => {
    const r = classifyAttendanceStatuses(
      base({ checkInAt: at(inAt), checkOutAt: at(outAt), ...overrides }),
    );
    expect([
      r.primaryStatus,
      r.punchStatus,
      r.arrivalStatus,
      r.departureStatus,
      r.isProvisional,
    ]).toEqual(expected);
  });
});

describe('classifyAttendanceStatuses — edge rules', () => {
  it('does not mark absent before the cutoff', () => {
    const r = classifyAttendanceStatuses(
      base({ legacyStatus: L.ABSENT, cutoffPassed: false }),
    );
    expect(r.primaryStatus).toBe('NOT_YET_CHECKED_IN');
    expect(r.arrivalStatus).toBe('NOT_YET_CHECKED_IN');
    expect(r.punchStatus).toBe('IN_PROGRESS');
  });

  it('is undetermined when the policy does not auto-mark absence', () => {
    const r = classifyAttendanceStatuses(
      base({ legacyStatus: L.ABSENT, autoAbsentIfNoCheckin: false }),
    );
    expect(r.primaryStatus).toBe('UNDETERMINED');
  });

  it('flags invalid punch records independently of presence', () => {
    const r = classifyAttendanceStatuses(
      base({
        checkInAt: at('08:15'),
        checkOutAt: at('08:15'),
        hasInvalidPunches: true,
      }),
    );
    expect(r.primaryStatus).toBe('PRESENT');
    expect(r.punchStatus).toBe('INVALID');
  });

  it('maps business trips to official duty and exemption to N/A', () => {
    expect(
      classifyAttendanceStatuses(base({ legacyStatus: L.BUSINESS_TRIP }))
        .primaryStatus,
    ).toBe('OFFICIAL_DUTY');
    const exempt = classifyAttendanceStatuses(
      base({ legacyStatus: L.NOT_TRACKED, attendanceExempt: true }),
    );
    expect(exempt.primaryStatus).toBe('NOT_APPLICABLE');
    expect(exempt.punchStatus).toBe('NOT_REQUIRED');
  });

  it('evaluates punches worked on an off day', () => {
    const r = classifyAttendanceStatuses(
      base({
        legacyStatus: L.OFF_DAY_PRESENT,
        checkInAt: at('08:15'),
        checkOutAt: at('17:15'),
      }),
    );
    expect(r.primaryStatus).toBe('PRESENT');
    expect(r.punchStatus).toBe('COMPLETE');
  });
});
