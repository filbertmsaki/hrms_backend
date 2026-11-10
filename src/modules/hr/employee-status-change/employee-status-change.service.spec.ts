import { UnprocessableEntityException } from '@nestjs/common';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { EmployeeLifecycleService } from '../employees/employee-lifecycle.service';
import { EmploymentEventTypeEnum } from '../employment-history/enums/employment-event-type.enum';
import { EmployeeStatusChangeService } from './employee-status-change.service';

const actor = (permissions: string[] = []) =>
  ({
    id: 1,
    companyId: 10,
    companyMembershipId: 99,
    permissions,
  }) as never;

function build(status: EmploymentStatusEnum) {
  const employee = {
    id: 5,
    company_id: 10,
    employment_status: status,
    company_user_id: 50,
    reports_to: null,
    exit_date: null,
    exit_reason: null,
    notes: null,
    attendance_exempt_reason: null,
  };
  const repo = {
    findOne: jest.fn().mockResolvedValue(employee),
    findOneOrFail: jest.fn().mockResolvedValue(employee),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
    update: jest.fn(),
    create: jest.fn((value: unknown) => value),
    createQueryBuilder: jest.fn(() => {
      const qb: Record<string, jest.Mock> = {};
      for (const method of ['where', 'andWhere', 'orderBy']) {
        qb[method] = jest.fn(() => qb);
      }
      qb.getOne = jest.fn().mockResolvedValue(null);
      return qb;
    }),
  };
  const manager = { getRepository: jest.fn(() => repo) };
  const dataSource = {
    getRepository: jest.fn(() => repo),
    transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)),
    manager,
  };
  const deps = {
    employeesService: {
      applyStatusChangeInTransaction: jest.fn().mockResolvedValue(employee),
      findOne: jest.fn().mockResolvedValue({ id: 5 }),
    },
    hrAccessService: { assertCanAccessEmployee: jest.fn() },
    readiness: { hasActiveSchedule: jest.fn().mockResolvedValue(false) },
    shiftAssignments: { create: jest.fn().mockResolvedValue({ id: 70 }) },
    timetables: { create: jest.fn().mockResolvedValue({ id: 71 }) },
    onboarding: {
      getEmployeeActivationBlockers: jest.fn(),
      finalizeOnboardingInTransaction: jest.fn(),
      afterOnboardingCompleted: jest.fn().mockResolvedValue(undefined),
    },
    offboarding: {
      createOffboardingRequest: jest.fn().mockResolvedValue({
        id: 300,
        offboarding_code: 'OFF-1',
        status: 'pending_manager',
      }),
      updateRequestProgress: jest.fn(),
      logOffboardingRequestCreated: jest.fn().mockResolvedValue(undefined),
    },
    history: { record: jest.fn() },
    security: { log: jest.fn() },
    notifications: { createAndPush: jest.fn() },
  };
  const service = new EmployeeStatusChangeService(
    dataSource as never,
    deps.employeesService as never,
    new EmployeeLifecycleService(),
    deps.hrAccessService as never,
    deps.readiness as never,
    deps.shiftAssignments as never,
    deps.timetables as never,
    deps.onboarding as never,
    deps.offboarding as never,
    {} as never,
    {} as never,
    deps.history as never,
    deps.security as never,
    deps.notifications as never,
  );
  return { service, deps, dataSource };
}

describe('EmployeeStatusChangeService.changeStatus', () => {
  it('assigns the selected shift and activates in the same transaction', async () => {
    const { service, deps, dataSource } = build(EmploymentStatusEnum.SUSPENDED);
    deps.readiness.hasActiveSchedule.mockResolvedValue(true);

    await service.changeStatus(
      10,
      5,
      {
        employment_status: EmploymentStatusEnum.ACTIVE,
        effective_date: '2026-11-10',
        schedule: { mode: 'shift', id: 3 },
      },
      actor(),
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(deps.shiftAssignments.create).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        employee_id: 5,
        shift_id: 3,
        effective_from: '2026-11-10',
      }),
      expect.anything(),
    );
    expect(
      deps.employeesService.applyStatusChangeInTransaction,
    ).toHaveBeenCalled();
    expect(deps.history.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: EmploymentEventTypeEnum.STATUS_CHANGED,
      }),
      expect.anything(),
    );
  });

  it('keeps the activation rule and reports it on the schedule field', async () => {
    const { service, deps } = build(EmploymentStatusEnum.INACTIVE);

    const error = await service
      .changeStatus(
        10,
        5,
        {
          employment_status: EmploymentStatusEnum.ACTIVE,
          effective_date: '2026-11-10',
        },
        actor(),
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toEqual(
      expect.objectContaining({
        field_errors: {
          'schedule.id': expect.stringContaining('shift or timetable'),
        },
      }),
    );
    expect(
      deps.employeesService.applyStatusChangeInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('defers the status change to offboarding without the force-exit permission', async () => {
    const { service, deps } = build(EmploymentStatusEnum.ACTIVE);

    const result = await service.changeStatus(
      10,
      5,
      {
        employment_status: EmploymentStatusEnum.TERMINATED,
        effective_date: '2026-11-10',
        exit: {
          exit_date: '2026-11-30',
          last_working_day: '2026-11-28',
          reason: 'end_of_contract',
          rehire_eligible: true,
        },
      },
      actor(),
    );

    expect(deps.offboarding.createOffboardingRequest).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        submit: true,
        last_working_date: '2026-11-28',
      }),
      expect.anything(),
      undefined,
      expect.anything(),
    );
    expect(
      deps.employeesService.applyStatusChangeInTransaction,
    ).not.toHaveBeenCalled();
    expect(result.status_change.status_deferred).toBe(true);
    expect(deps.history.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: EmploymentEventTypeEnum.OTHER,
        newValues: expect.objectContaining({
          pending_status: EmploymentStatusEnum.INACTIVE,
        }),
      }),
      expect.anything(),
    );
  });

  it('changes the status now when the actor can force exit statuses', async () => {
    const { service, deps } = build(EmploymentStatusEnum.ACTIVE);

    const result = await service.changeStatus(
      10,
      5,
      {
        employment_status: EmploymentStatusEnum.RESIGNED,
        effective_date: '2026-11-10',
        exit: {
          exit_date: '2026-11-30',
          last_working_day: '2026-11-28',
          reason: 'resignation',
          end_schedule: false,
        },
      },
      actor(['employees:force-exit-status']),
    );

    expect(
      deps.employeesService.applyStatusChangeInTransaction,
    ).toHaveBeenCalledWith(
      expect.anything(),
      10,
      5,
      expect.objectContaining({
        exit_date: '2026-11-30',
        exit_reason: 'Resignation',
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(result.status_change.status_deferred).toBe(false);
  });

  it('rejects a last working day after the exit date with a field error', async () => {
    const { service, deps } = build(EmploymentStatusEnum.ACTIVE);

    const error = await service
      .changeStatus(
        10,
        5,
        {
          employment_status: EmploymentStatusEnum.EXITED,
          effective_date: '2026-11-10',
          exit: {
            exit_date: '2026-11-10',
            last_working_day: '2026-11-20',
            reason: 'resignation',
          },
        },
        actor(['employees:force-exit-status']),
      )
      .catch((caught: unknown) => caught);

    expect((error as UnprocessableEntityException).getResponse()).toEqual(
      expect.objectContaining({
        field_errors: expect.objectContaining({
          'exit.last_working_day': expect.any(String),
        }),
      }),
    );
    expect(deps.offboarding.createOffboardingRequest).not.toHaveBeenCalled();
  });

  it('activates onboarding employees through onboarding completion with the inline schedule', async () => {
    const { service, deps } = build(EmploymentStatusEnum.ONBOARDING);
    deps.onboarding.getEmployeeActivationBlockers.mockResolvedValue({
      request: { id: 17, status: 'in_progress', planned_start_date: null },
      blockers: [],
      provisioning: null,
    });
    deps.onboarding.finalizeOnboardingInTransaction.mockResolvedValue({
      id: 17,
    });

    await service.changeStatus(
      10,
      5,
      {
        employment_status: EmploymentStatusEnum.ACTIVE,
        effective_date: '2026-11-10',
        schedule: { mode: 'timetable', id: 8 },
        activation: { leave_policy_id: 2 },
      },
      actor(),
    );

    expect(
      deps.onboarding.finalizeOnboardingInTransaction,
    ).toHaveBeenCalledWith(expect.anything(), 10, 17, expect.anything(), {
      provisioningOverride: expect.objectContaining({
        attendance_mode: 'timetable',
        timetable_assignment: { timetable_id: 8, effective_from: '2026-11-10' },
        leave_policy_id: 2,
      }),
    });
    expect(
      deps.employeesService.applyStatusChangeInTransaction,
    ).not.toHaveBeenCalled();
    expect(deps.onboarding.afterOnboardingCompleted).toHaveBeenCalled();
  });

  it('blocks onboarding activation while onboarding items are outstanding', async () => {
    const { service, deps } = build(EmploymentStatusEnum.ONBOARDING);
    deps.onboarding.getEmployeeActivationBlockers.mockResolvedValue({
      request: { id: 17, status: 'in_progress', planned_start_date: null },
      blockers: [{ key: 'onboarding_task:1', label: 'Sign NDA' }],
      provisioning: null,
    });

    await expect(
      service.changeStatus(
        10,
        5,
        {
          employment_status: EmploymentStatusEnum.ACTIVE,
          effective_date: '2026-11-10',
          schedule: { mode: 'shift', id: 3 },
        },
        actor(),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(
      deps.onboarding.finalizeOnboardingInTransaction,
    ).not.toHaveBeenCalled();
  });
});
