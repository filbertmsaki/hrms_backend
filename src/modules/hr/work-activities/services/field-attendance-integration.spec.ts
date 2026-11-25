import { FieldVisitService } from './field-visit.service';
import { AttendancePunchTypeEnum } from '../../attendance/mobile-punches/enums/attendance-punch-type.enum';
import { AttendancePunchValidationStatusEnum } from '../../attendance/mobile-punches/enums/attendance-punch-validation-status.enum';
import type { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';

describe('field attendance retry', () => {
  const actor = {
    companyId: 1,
    employeeId: 2,
    permissions: [],
    roles: [],
  } as AuthenticatedUser;
  const event = () => ({
    id: 4,
    companyId: 1,
    employeeId: 2,
    fieldVisitId: 3,
    eventType: 'CHECK_IN',
    clientRequestId: '8ca930d4-0085-4fa6-a212-492150e35252',
    capturedAt: new Date('2026-11-25T08:00:00Z'),
    latitude: '-6.8',
    longitude: '39.2',
    accuracyMeters: '5',
    deviceIdentifier: 'field-web-device',
    isOfflineCapture: false,
    attendanceSyncStatus: 'FAILED',
    attendanceMobilePunchId: null,
    attendanceSyncMessage: null,
    locationValidationStatus: 'CAPTURED',
  });
  let stored: ReturnType<typeof event>;
  const locationRepository = { findOne: jest.fn(), save: jest.fn() };
  const visitRepository = { findOne: jest.fn() };
  const employeeRepository = { findOne: jest.fn() };
  const policy = { resolveForEmployee: jest.fn() };
  const punchService = {
    getMyPunchPolicy: jest.fn(),
    findEmployeePunchByRequest: jest.fn(),
    getEmployeePunchState: jest.fn(),
    checkIn: jest.fn(),
    checkOut: jest.fn(),
  };
  let service: FieldVisitService;

  beforeEach(() => {
    jest.resetAllMocks();
    stored = event();
    locationRepository.findOne.mockImplementation(async () => stored);
    locationRepository.save.mockImplementation(async (value) => value);
    visitRepository.findOne.mockResolvedValue({
      id: 3,
      companyId: 1,
      employeeId: 2,
      visitDate: '2026-11-25',
    });
    employeeRepository.findOne.mockResolvedValue({ id: 2, company_id: 1 });
    policy.resolveForEmployee.mockResolvedValue({
      fieldAttendanceMode: 'START',
    });
    punchService.findEmployeePunchByRequest.mockResolvedValue(null);
    punchService.getMyPunchPolicy.mockResolvedValue({
      allow_location_exception_override: false,
    });
    punchService.getEmployeePunchState.mockResolvedValue({
      hasCheckIn: false,
      hasCheckOut: false,
    });
    punchService.checkIn.mockResolvedValue({
      punch: {
        id: 11,
        punchType: AttendancePunchTypeEnum.CHECK_IN,
        validationStatus: AttendancePunchValidationStatusEnum.APPROVED,
      },
    });
    service = new FieldVisitService(
      {} as never,
      {} as never,
      { ensureActorCompanyId: () => 1 } as never,
      {} as never,
      policy as never,
      {} as never,
      {} as never,
      employeeRepository as never,
      {} as never,
      {} as never,
      {} as never,
      visitRepository as never,
      locationRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      punchService as never,
    );
  });

  it('uses the captured field event and links the approved attendance punch', async () => {
    const result = await service.retryFieldAttendance(actor, 3, 'CHECK_IN');
    expect(result.status).toBe('LINKED');
    expect(stored.attendanceMobilePunchId).toBe(11);
    expect(punchService.checkIn).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'WEB',
        dto: expect.objectContaining({
          latitude: -6.8,
          longitude: 39.2,
          clientRequestId: stored.clientRequestId,
        }),
      }),
    );
  });

  it('does not create another punch when an attendance check-in already exists', async () => {
    punchService.getEmployeePunchState.mockResolvedValue({
      hasCheckIn: true,
      hasCheckOut: false,
    });
    const result = await service.retryFieldAttendance(actor, 3, 'CHECK_IN');
    expect(result.status).toBe('ALREADY_RECORDED');
    expect(punchService.checkIn).not.toHaveBeenCalled();
  });

  it('submits an allowed location exception for attendance review', async () => {
    punchService.getMyPunchPolicy.mockResolvedValue({
      allow_location_exception_override: true,
    });
    punchService.checkIn.mockResolvedValue({
      punch: {
        id: 12,
        punchType: AttendancePunchTypeEnum.CHECK_IN,
        validationStatus: AttendancePunchValidationStatusEnum.PENDING_OVERRIDE,
      },
    });
    const result = await service.retryFieldAttendance(actor, 3, 'CHECK_IN');
    expect(result.status).toBe('LINKED');
    expect(result.message).toContain('awaiting review');
    expect(punchService.checkIn).toHaveBeenCalledWith(
      expect.objectContaining({
        dto: expect.objectContaining({
          overrideReason: expect.stringContaining('Field visit'),
        }),
      }),
    );
  });

  it('requires attendance review when the field event has a GPS exception', async () => {
    stored.locationValidationStatus = 'EXCEPTION_PENDING';
    punchService.checkIn.mockResolvedValue({ punch: { id: 13, punchType: AttendancePunchTypeEnum.CHECK_IN, validationStatus: AttendancePunchValidationStatusEnum.PENDING_OVERRIDE } });
    const result = await service.retryFieldAttendance(actor, 3, 'CHECK_IN');
    expect(result.message).toContain('awaiting review');
    expect(punchService.checkIn).toHaveBeenCalledWith(expect.objectContaining({ forceReview: true }));
  });

  it('keeps the field event and reports an attendance policy rejection', async () => {
    punchService.checkIn.mockRejectedValue(
      new Error('Location is outside the attendance geofence.'),
    );
    const result = await service.retryFieldAttendance(actor, 3, 'CHECK_IN');
    expect(result.status).toBe('FAILED');
    expect(result.message).toContain('geofence');
    expect(stored.attendanceMobilePunchId).toBeNull();
  });
});
