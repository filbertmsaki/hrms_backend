import { FieldVisitService } from './field-visit.service';
import {
  FieldVisit,
  FieldVisitCheckoutCorrection,
} from '../entities/field-visit.entities';
import { FieldVisitStatusEnum } from '../enums/work-activity.enums';

describe('field checkout correction review', () => {
  const actor = {
    companyId: 1,
    employeeId: 8,
    companyMembershipId: 9,
    roles: [],
    permissions: [],
  } as never;
  const correction = {
    id: 3,
    companyId: 1,
    employeeId: 2,
    fieldVisitId: 7,
    requestedCheckoutAt: new Date('2026-11-25T10:00:00Z'),
    discussionNotes: 'Discussion',
    outcome: 'Agreed',
    status: 'PENDING',
    reason: 'Forgot',
  };
  const visit = {
    id: 7,
    companyId: 1,
    employeeId: 2,
    managerEmployeeId: 8,
    managerCompanyUserId: null,
    status: FieldVisitStatusEnum.CHECKED_IN,
    checkInAt: new Date('2026-11-25T09:15:00Z'),
    visitPlanId: null,
  };
  const requestRepo = { findOne: jest.fn(), save: jest.fn() };
  const visitRepo = { findOne: jest.fn(), save: jest.fn() };
  const manager = {
    getRepository: jest.fn((type) =>
      type === FieldVisitCheckoutCorrection
        ? requestRepo
        : type === FieldVisit
          ? visitRepo
          : null,
    ),
  };
  const dataSource = { transaction: jest.fn(async (run) => run(manager)) };
  const actionItems = {
    completeAllOpenForEntity: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    jest.clearAllMocks();
    requestRepo.findOne.mockResolvedValue({ ...correction });
    requestRepo.save.mockImplementation(async (item) => item);
    visitRepo.findOne.mockResolvedValue({ ...visit });
    visitRepo.save.mockImplementation(async (item) => item);
  });

  function createService() {
    return new FieldVisitService(
      dataSource as never,
      {} as never,
      { ensureActorCompanyId: () => 1 } as never,
      actionItems as never,
      {} as never,
      audit as never,
      {} as never,
      {
        findOne: jest.fn().mockResolvedValue({ id: 2, company_user_id: null }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('only applies the requested checkout after approval and leaves it for visit review', async () => {
    const result = await createService().reviewCheckoutCorrection(actor, 3, {
      decision: 'APPROVE',
      comments: 'Confirmed',
    });
    expect(result.status).toBe('APPROVED');
    expect(visitRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: FieldVisitStatusEnum.MANAGER_REVIEW_PENDING,
        durationMinutes: 45,
        outcome: 'Agreed',
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'FIELD_CHECKOUT_CORRECTION_REVIEWED' }),
      manager,
    );
  });

  it('does not change a visit when the request is rejected', async () => {
    const result = await createService().reviewCheckoutCorrection(actor, 3, {
      decision: 'REJECT',
      comments: 'Needs clarification',
    });
    expect(result.status).toBe('REJECTED');
    expect(visitRepo.save).not.toHaveBeenCalled();
  });
});
