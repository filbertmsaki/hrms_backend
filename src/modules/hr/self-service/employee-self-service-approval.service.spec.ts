import { EntityManager, Repository } from 'typeorm';
import { EmployeeSelfServiceApprovalService } from './employee-self-service-approval.service';
import { EmployeeProfileUpdateRequest } from './entities/employee-profile-update-request.entity';
import { AttendanceCorrectionRequest } from './entities/attendance-correction-request.entity';
import { Employee } from '../employees/entities/employee.entity';
import { AttendanceDailySummaryService } from '../attendance/processing/attendance-daily-summary.service';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { SelfServiceRequestStatusEnum as Status } from './enums/self-service-request-status.enum';

const actor = {
  companyId: 10,
  companyMembershipId: 90,
  id: 9,
} as AuthenticatedUser;

function harness(failDecision = false, status = Status.SUBMITTED) {
  let committed = { first_name: 'Before', status };
  const employeeSave = jest.fn();
  const decisionSave = jest.fn();
  const requestFind = jest.fn();
  const adjustment = {
    upsertAdjustment: jest.fn().mockResolvedValue({ id: 3 }),
  };
  let usedManager: EntityManager;
  const transaction = async (
    work: (manager: EntityManager) => Promise<unknown>,
  ) => {
    const employee = { id: 501, first_name: committed.first_name };
    const request = {
      id: 1,
      employeeId: 501,
      companyId: 10,
      status: committed.status,
      requestedChanges: { first_name: 'After' },
      attendanceDate: '2026-10-17',
      metadata: {},
    };
    const requests = {
      findOne: requestFind.mockImplementation(() => Promise.resolve(request)),
      save: decisionSave.mockImplementation(() => {
        if (failDecision) throw new Error('Decision write failed');
        return Promise.resolve(request);
      }),
    };
    const manager = {
      getRepository: (entity: unknown) =>
        entity === Employee
          ? {
              findOne: jest.fn().mockResolvedValue(employee),
              save: employeeSave.mockResolvedValue(employee),
            }
          : requests,
    } as unknown as EntityManager;
    usedManager = manager;
    const result = await work(manager);
    committed = { first_name: employee.first_name, status: request.status };
    return result;
  };
  const root = {
    manager: { transaction },
    save: jest.fn(),
    findOne: jest.fn(),
  };
  const service = new EmployeeSelfServiceApprovalService(
    root as unknown as Repository<AttendanceCorrectionRequest>,
    root as unknown as Repository<EmployeeProfileUpdateRequest>,
    root as unknown as Repository<Employee>,
    adjustment as unknown as AttendanceDailySummaryService,
  );
  return {
    service,
    root,
    employeeSave,
    decisionSave,
    requestFind,
    adjustment,
    committed: () => committed,
    manager: () => usedManager,
  };
}

describe('Self-service approval transactions', () => {
  it('persists profile and decision through the same transaction after locking the request', async () => {
    const h = harness();
    await h.service.approveProfileUpdateRequest(actor, 1, {});
    expect(h.committed()).toEqual({
      first_name: 'After',
      status: Status.APPROVED,
    });
    expect(h.requestFind).toHaveBeenCalledWith({
      where: { id: 1, companyId: 10 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(h.root.save).not.toHaveBeenCalled();
    expect(h.root.findOne).not.toHaveBeenCalled();
  });

  it('does not commit the profile if the approval decision fails', async () => {
    const h = harness(true);
    await expect(
      h.service.approveProfileUpdateRequest(actor, 1, {}),
    ).rejects.toThrow('Decision write failed');
    expect(h.employeeSave).toHaveBeenCalled();
    expect(h.committed()).toEqual({
      first_name: 'Before',
      status: Status.SUBMITTED,
    });
  });

  it.each([
    'approveProfileUpdateRequest',
    'rejectProfileUpdateRequest',
    'approveAttendanceCorrectionRequest',
    'rejectAttendanceCorrectionRequest',
  ] as const)(
    '%s rechecks the locked decision and rejects a second reviewer',
    async (method) => {
      const h = harness(false, Status.APPROVED);
      await expect(h.service[method](actor, 1, {})).rejects.toThrow(
        'Only submitted',
      );
      expect(h.decisionSave).not.toHaveBeenCalled();
      expect(h.adjustment.upsertAdjustment).not.toHaveBeenCalled();
    },
  );

  it('passes the approval transaction to attendance recalculation', async () => {
    const h = harness();
    await h.service.approveAttendanceCorrectionRequest(actor, 1, {});
    expect(h.adjustment.upsertAdjustment).toHaveBeenCalledWith(
      10,
      501,
      '2026-10-17',
      expect.any(Object),
      90,
      expect.any(Object),
      h.manager(),
    );
    expect(h.committed().status).toBe(Status.APPROVED);
  });
});
