/**
 * FRS-11 Phase 4: leave approval authorization against real Postgres:
 * self-approval, unassigned approvers, delegates, rejection reason, HR
 * override limits, double-submission under row locks, cross-company scope
 * and the employee-access matrix used by every leave read/PDF/download.
 *
 *   DB_NAME=hrms_frs11_e2e npm run test:e2e -- leave-authorization-postgres
 */
import './setup-e2e';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppDataSource } from '../src/database/data-source';
import { LeaveWorkflowService } from '../src/modules/hr/leave/services/leave-workflow.service';
import { LeaveApprovalWorkflow } from '../src/modules/hr/leave/entities/leave-approval-workflow.entity';
import { LeaveApprovalWorkflowStep } from '../src/modules/hr/leave/entities/leave-approval-workflow-step.entity';
import { LeaveRequestApproval } from '../src/modules/hr/leave/entities/leave-request-approval.entity';
import { LeaveRequest } from '../src/modules/hr/leave/entities/leave-request.entity';
import { LeaveApprovalActionEnum } from '../src/modules/hr/leave/enums/leave-approval-action.enum';
import { HrAccessService } from '../src/modules/hr/shared/hr-access.service';

describe('Leave authorization (real Postgres)', () => {
  let ds: DataSource;
  let workflow: LeaveWorkflowService;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const co: Record<'A' | 'B', number> = { A: 0, B: 0 };
  const cu: Record<string, number> = {};
  const emp: Record<string, number> = {};
  let typeId: number;
  let phoneSeq = 0;

  const one = async (sql: string, p: unknown[]) =>
    (await ds.query(sql, p))[0].id;

  async function person(key: string, company: number, managerKey?: string) {
    const user = await one(
      `INSERT INTO users (user_no, first_name, last_name, phone, email, password)
       VALUES ($1,$2,'Test',$3,$4,'x') RETURNING id`,
      [
        `U${++phoneSeq}-${suffix.slice(-10)}`,
        key,
        `+255${String(phoneSeq).padStart(3, '0')}${suffix.slice(-8)}`,
        `${key}-${suffix}@example.test`,
      ],
    );
    cu[key] = await one(
      `INSERT INTO company_users (company_id, user_id) VALUES ($1,$2) RETURNING id`,
      [company, user],
    );
    emp[key] = await one(
      `INSERT INTO employees (company_id, company_user_id, employee_no, first_name, last_name, gender, version, reports_to)
       VALUES ($1,$2,$3,$4,'Test','female',1,$5) RETURNING id`,
      [
        company,
        cu[key],
        `${key}-${suffix}`.slice(0, 50),
        key,
        managerKey ? emp[managerKey] : null,
      ],
    );
  }

  async function pendingRequest(employeeKey: string, approvers: string[]) {
    const id = await one(
      `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, leave_no, start_date, end_date,
         total_days, reason, created_by_company_user_id, version, status, current_approval_level, approval_cycle)
       VALUES ($1,$2,$3,$4,'2026-12-01','2026-12-01',1,'x',$5,1,'pending_department_manager',1,1) RETURNING id`,
      [
        co.A,
        emp[employeeKey],
        typeId,
        `AUTH-${employeeKey}-${Math.random()}`.slice(0, 50),
        cu[employeeKey],
      ],
    );
    for (const a of approvers) {
      await ds.query(
        `INSERT INTO leave_request_approvals (leave_request_id, approval_level, approval_cycle, approver_company_user_id, status)
         VALUES ($1,1,1,$2,'pending')`,
        [id, cu[a]],
      );
    }
    return id;
  }

  const act = (
    requestId: number,
    actorKey: string,
    action: LeaveApprovalActionEnum,
    extra: object = {},
  ) =>
    ds.transaction(async (m) => {
      await m.getRepository(LeaveRequest).findOneOrFail({
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      return workflow.applyApprovalAction(
        requestId,
        cu[actorKey],
        { action, ...extra },
        m,
      );
    });

  beforeAll(async () => {
    if (!/(_e2e|_test_db)$/.test(process.env.DB_NAME ?? ''))
      throw new Error('Restricted to disposable *_e2e / *_test_db databases.');
    ds = AppDataSource.isInitialized
      ? AppDataSource
      : await AppDataSource.initialize();
    for (const k of ['A', 'B'] as const) {
      co[k] = await one(
        `INSERT INTO companies (name, slug) VALUES ($1,$2) RETURNING id`,
        [`Auth ${k} ${suffix}`, `auth-${k.toLowerCase()}-${suffix}`],
      );
    }
    await person('manager', co.A);
    await person('staff', co.A, 'manager');
    await person('peer', co.A, 'manager');
    await person('delegate', co.A);
    await person('outsider', co.B);
    typeId = await one(
      `INSERT INTO leave_types (company_id, name, code) VALUES ($1,'Annual','AL') RETURNING id`,
      [co.A],
    );
    const r = (e: object) => ds.getRepository(e as never);
    workflow = new LeaveWorkflowService(
      r(LeaveApprovalWorkflow) as never,
      r(LeaveApprovalWorkflowStep) as never,
      r(LeaveRequestApproval) as never,
      r(LeaveRequest) as never,
      ds.getRepository('CompanyUser') as never,
      ds.getRepository('CompanyUserRole') as never,
      ds.getRepository('EmployeePosition') as never,
      ds.getRepository('Department') as never,
      ds.getRepository('Employee') as never,
      new EventEmitter2(),
      { get: () => undefined } as never,
    );
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(`DELETE FROM companies WHERE id = ANY($1)`, [
        [co.A, co.B],
      ]);
      await ds.destroy();
    }
  });

  it('blocks self-approval even when the employee is listed as approver', async () => {
    const id = await pendingRequest('staff', ['staff', 'manager']);
    await expect(
      act(id, 'staff', LeaveApprovalActionEnum.APPROVE),
    ).rejects.toThrow(/own leave request/);
  });

  it('blocks a colleague and an other-company user who are not assigned', async () => {
    const id = await pendingRequest('staff', ['manager']);
    await expect(
      act(id, 'peer', LeaveApprovalActionEnum.APPROVE),
    ).rejects.toThrow(/not assigned as an approver/);
    await expect(
      act(id, 'outsider', LeaveApprovalActionEnum.APPROVE),
    ).rejects.toThrow(/not assigned as an approver/);
  });

  it('requires a reason to reject, and HR override only at the manager stage', async () => {
    const id = await pendingRequest('staff', ['manager']);
    await expect(
      act(id, 'manager', LeaveApprovalActionEnum.REJECT),
    ).rejects.toThrow(/rejection reason/);
    await ds.query(
      `UPDATE leave_requests SET current_approval_level = 2 WHERE id=$1`,
      [id],
    );
    await ds.query(
      `UPDATE leave_request_approvals SET approval_level = 2 WHERE leave_request_id=$1`,
      [id],
    );
    await expect(
      act(id, 'peer', LeaveApprovalActionEnum.APPROVE, {
        hr_override: true,
        comments: 'HR acting',
      }),
    ).rejects.toThrow(/only available at the manager stage/);
  });

  it('lets an assigned delegate act, and records who decided', async () => {
    const id = await pendingRequest('staff', ['delegate']);
    await act(id, 'delegate', LeaveApprovalActionEnum.REJECT, {
      comments: 'Clash with audit week',
    });
    const rows = await ds.query(
      `SELECT approver_company_user_id a, status FROM leave_request_approvals WHERE leave_request_id=$1`,
      [id],
    );
    expect(rows).toEqual([{ a: cu.delegate, status: 'rejected' }]);
    const [req] = await ds.query(
      `SELECT status FROM leave_requests WHERE id=$1`,
      [id],
    );
    expect(req.status).toBe('rejected');
  });

  it('accepts exactly one of two simultaneous decisions on the same request', async () => {
    const id = await pendingRequest('staff', ['manager']);
    const settled = await Promise.allSettled([
      act(id, 'manager', LeaveApprovalActionEnum.REJECT, {
        comments: 'double click 1',
      }),
      act(id, 'manager', LeaveApprovalActionEnum.REJECT, {
        comments: 'double click 2',
      }),
    ]);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    const [{ n }] = await ds.query(
      `SELECT count(*)::int n FROM leave_request_approvals WHERE leave_request_id=$1 AND status='rejected'`,
      [id],
    );
    expect(n).toBe(1);
  });

  describe('employee access matrix (real HrAccessService scope queries)', () => {
    let svc: HrAccessService;
    beforeAll(async () => {
      await person('report2', co.A, 'staff'); // second-level report of manager
      // Corrupt cross-company link: a company-B employee pointing at manager.
      await person('foreign', co.B, 'manager');
      svc = new HrAccessService(
        ds.getRepository('CompanyUserBranchAccess') as never,
        ds.getRepository('Branch') as never,
        ds.getRepository('CompanyUserDepartmentAccess') as never,
        ds.getRepository('Department') as never,
        ds.getRepository('Employee') as never,
      );
    });
    const actor = (key: string, permissions: string[], company = co.A) =>
      ({
        userId: 0,
        companyId: company,
        companyMembershipId: cu[key],
        employeeId: emp[key],
        permissions,
      }) as never;
    const target = (key: string) =>
      ({
        id: emp[key],
        company_id: ['foreign', 'outsider'].includes(key) ? co.B : co.A,
      }) as never;
    const can = (a: never, t: string) =>
      svc.assertCanAccessEmployee(a, target(t)).then(
        () => true,
        () => false,
      );

    it.each([
      ['employee → own record', 'staff', ['data_scope:self'], 'staff', true],
      ['employee → colleague', 'staff', ['data_scope:self'], 'peer', false],
      [
        'manager → direct report',
        'manager',
        ['data_scope:team'],
        'staff',
        true,
      ],
      [
        'manager → indirect report',
        'manager',
        ['data_scope:team'],
        'report2',
        true,
      ],
      [
        'manager → non-report',
        'manager',
        ['data_scope:team'],
        'delegate',
        false,
      ],
      [
        'manager → other company employee linked to them',
        'manager',
        ['data_scope:team'],
        'foreign',
        false,
      ],
      [
        'manager without team scope → report',
        'manager',
        ['data_scope:self'],
        'staff',
        false,
      ],
      [
        'HR company scope → any employee',
        'peer',
        ['data_scope:company'],
        'delegate',
        true,
      ],
      [
        'delegate without scope → staff',
        'delegate',
        ['leave_requests:approve'],
        'staff',
        false,
      ],
    ])('%s', async (_label, who, perms, whom, expected) => {
      expect(await can(actor(who, perms), whom)).toBe(expected);
    });
  });
});
