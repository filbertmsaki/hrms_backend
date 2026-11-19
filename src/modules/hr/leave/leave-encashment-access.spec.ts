import { ForbiddenException } from '@nestjs/common';
import { LeaveService } from './leave.service';

/** Regression: encashment list/decision must respect employee scope. */
describe('leave encashment access', () => {
  function qbSpy(rows: unknown[] = []) {
    const wheres: Array<[string, unknown]> = [];
    const qb: Record<string, jest.Mock> = {};
    for (const m of ['leftJoinAndSelect', 'orderBy', 'skip', 'take'])
      qb[m] = jest.fn(() => qb);
    qb.where = jest.fn(
      (sql: string, p: unknown) => (wheres.push([sql, p]), qb),
    );
    qb.andWhere = jest.fn(
      (sql: string, p: unknown) => (wheres.push([sql, p]), qb),
    );
    qb.getManyAndCount = jest.fn().mockResolvedValue([rows, rows.length]);
    return { qb, wheres };
  }

  function service(allowed: number[] | null) {
    const svc = Object.create(LeaveService.prototype) as LeaveService &
      Record<string, unknown>;
    const { qb, wheres } = qbSpy();
    Object.assign(svc, {
      hrAccessService: {
        getAccessibleEmployeeIds: jest.fn().mockResolvedValue(allowed),
        assertCanAccessEmployee: jest.fn(async (_a, e: { id: number }) => {
          if (allowed && !allowed.includes(e.id))
            throw new ForbiddenException('no access');
        }),
      },
      leaveEncashmentRepository: { createQueryBuilder: () => qb },
    });
    return { svc, wheres };
  }

  const actor = {
    userId: 1,
    companyId: 1,
    companyMembershipId: 10,
    employeeId: 100,
    permissions: [],
  } as never;

  it('limits the list to accessible employees', async () => {
    const { svc, wheres } = service([100, 101]);
    await svc.listLeaveEncashmentRequests(1, {}, actor);
    expect(wheres).toContainEqual([
      'request.employee_id IN (:...allowedEmployeeIds)',
      { allowedEmployeeIds: [100, 101] },
    ]);
  });

  it('keeps the company-wide list for company-scope HR', async () => {
    const { svc, wheres } = service(null);
    await svc.listLeaveEncashmentRequests(1, {}, actor);
    expect(wheres.map(([sql]) => sql)).toEqual([
      'request.company_id = :companyId',
    ]);
  });

  it('refuses a decision on an employee outside the decider scope', async () => {
    const { svc } = service([100, 101]);
    const item = {
      id: 5,
      company_id: 1,
      employee_id: 999,
      status: 'pending',
      created_by_company_user_id: 77,
    };
    Object.assign(svc, {
      dataSource: {
        transaction: (fn: (m: unknown) => unknown) =>
          fn({
            getRepository: (e: { name?: string }) =>
              e?.name === 'Employee'
                ? { findOneOrFail: jest.fn().mockResolvedValue({ id: 999 }) }
                : {
                    createQueryBuilder: () => {
                      const q: Record<string, jest.Mock> = {};
                      q.setLock = jest.fn(() => q);
                      q.where = jest.fn(() => q);
                      q.getOne = jest.fn().mockResolvedValue(item);
                      return q;
                    },
                    save: jest.fn(),
                  },
          }),
      },
    });
    await expect(
      svc.decideLeaveEncashmentRequest(1, 5, { approve: true } as never, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(item.status).toBe('pending');
  });
});
