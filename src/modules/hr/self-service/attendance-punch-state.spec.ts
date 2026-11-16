import { EmployeeSelfServiceService } from './employee-self-service.service';
import { AttendancePunchTypeEnum } from '../attendance/mobile-punches/enums/attendance-punch-type.enum';
import { AttendancePunchValidationStatusEnum } from '../attendance/mobile-punches/enums/attendance-punch-validation-status.enum';

type PunchStateFn = (
  punches: Array<{
    punchType: AttendancePunchTypeEnum;
    validationStatus: AttendancePunchValidationStatusEnum;
  }>,
  summary?: { checkInAt?: Date | null; checkOutAt?: Date | null } | null,
) => string;

describe('EmployeeSelfServiceService punch state', () => {
  const resolvePunchState = (
    EmployeeSelfServiceService.prototype as unknown as {
      resolvePunchState: PunchStateFn;
    }
  ).resolvePunchState;

  const punch = (
    punchType: AttendancePunchTypeEnum,
    validationStatus = AttendancePunchValidationStatusEnum.APPROVED,
  ) => ({ punchType, validationStatus });

  it('is not checked in with no punches and no summary times', () => {
    expect(resolvePunchState([], null)).toBe('not_checked_in');
  });

  it('treats a check-in awaiting approval as checked in', () => {
    expect(
      resolvePunchState([
        punch(
          AttendancePunchTypeEnum.CHECK_IN,
          AttendancePunchValidationStatusEnum.PENDING_OVERRIDE,
        ),
      ]),
    ).toBe('checked_in');
  });

  it('ignores rejected punches', () => {
    expect(
      resolvePunchState([
        punch(
          AttendancePunchTypeEnum.CHECK_IN,
          AttendancePunchValidationStatusEnum.OVERRIDE_REJECTED,
        ),
      ]),
    ).toBe('not_checked_in');
  });

  it('uses the daily summary for biometric punches', () => {
    expect(resolvePunchState([], { checkInAt: new Date() })).toBe('checked_in');
    expect(
      resolvePunchState([], { checkInAt: new Date(), checkOutAt: new Date() }),
    ).toBe('checked_out');
  });

  it('is checked out once a check-out exists', () => {
    expect(
      resolvePunchState([
        punch(AttendancePunchTypeEnum.CHECK_IN),
        punch(AttendancePunchTypeEnum.CHECK_OUT),
      ]),
    ).toBe('checked_out');
  });
});
