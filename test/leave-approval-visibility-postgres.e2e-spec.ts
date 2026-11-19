/**
 * Sequential approval visibility over HTTP against Postgres: a leave request
 * is in an approver's queue only while their level is the active one, later
 * levels cannot open or act on it early, rejection stops routing, decided
 * approvers keep history access, and counts follow the same rules.
 *
 *   DB_NAME=hrms_e2e npm run test:e2e -- leave-approval-visibility-postgres
 */
import './setup-e2e';
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { hashPassword } from '../src/common/utils/hash.util';
import { createE2eApp } from './helpers/create-e2e-app';

type Row = {
  id: number;
  status: string;
  approval_progress: {
    total_levels: number;
    completed_levels: number;
    current_position: number | null;
    rejected_at_position: number | null;
    state: string;
  };
};
type Summary = {
  total: number;
  open: number;
  approved: number;
  rejected: number;
  pending_my_approval: number | null;
};

describe('Leave approval visibility (HTTP, Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let http: ReturnType<typeof request>;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const password = 'LeaveSeq!2026';
  const cu: Record<string, number> = {};
  const emp: Record<string, number> = {};
  const token: Record<string, string> = {};
  let companyId: number;
  let typeId: number;
  let seq = 0;
  const id = async (sql: string, p: unknown[]) =>
    (await ds.query<Array<{ id: number }>>(sql, p))[0].id;
  const get = (who: string, url: string) =>
    http.get(url).set('Authorization', `Bearer ${token[who]}`);
  const rows = async (who: string, view: string) => {
    const res = await get(who, `/api/leave/requests?view=${view}&limit=100`);
    expect(res.status).toBe(200);
    return (res.body as { data: Row[] }).data;
  };
  const ids = async (who: string, view: string) =>
    (await rows(who, view)).map((r) => r.id);

  async function person(key: string, permissions: string[], boss?: string) {
    seq += 1;
    const email = `${key}-${suffix}@example.test`;
    const user = await id(
      `INSERT INTO users (user_no, first_name, last_name, phone, email, password, status, user_type, is_email_verified, auth_token_version)
       VALUES ($1,$2,'Seq',$3,$4,$5,'active','COMPANY_USER',true,1) RETURNING id`,
      [
        `Q${seq}-${suffix.slice(-10)}`,
        key,
        `+2556${String(seq).padStart(2, '0')}${suffix.slice(-7)}`,
        email,
        await hashPassword(password),
      ],
    );
    cu[key] = await id(
      `INSERT INTO company_users (company_id, user_id, status, is_default) VALUES ($1,$2,'active',true) RETURNING id`,
      [companyId, user],
    );
    emp[key] = await id(
      `INSERT INTO employees (company_id, company_user_id, employee_no, first_name, last_name, gender, version, reports_to, hire_date, employment_status)
       VALUES ($1,$2,$3,$4,'Seq','female',1,$5,'2020-01-01','active') RETURNING id`,
      [
        companyId,
        cu[key],
        `${key}-${suffix}`.slice(0, 50),
        key,
        boss ? emp[boss] : null,
      ],
    );
    for (const name of permissions) {
      await ds.query(
        `INSERT INTO permissions (name, display_name) VALUES ($1,$1) ON CONFLICT (name) DO NOTHING`,
        [name],
      );
      await ds.query(
        `INSERT INTO company_user_permissions (company_user_id, permission_id) SELECT $1, id FROM permissions WHERE name=$2`,
        [cu[key], name],
      );
    }
    const res = await http.post('/api/auth/login').send({ email, password });
    token[key] = (res.body as { access_token: string }).access_token;
    expect(token[key]).toBeDefined();
  }

  /** A three-level request (l1 → l2 → l3), every row created up front as the workflow does. */
  async function threeLevelRequest() {
    const requestId = await id(
      `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, leave_no, start_date, end_date, total_days, reason,
         created_by_company_user_id, version, status, current_approval_level, approval_cycle)
       VALUES ($1,$2,$3,$4,'2026-12-01','2026-12-03',3,'Family',$5,1,'pending_department_manager',1,1) RETURNING id`,
      [
        companyId,
        emp.emp,
        typeId,
        `SEQ-${seq++}-${suffix}`.slice(0, 50),
        cu.emp,
      ],
    );
    const approvalIds: number[] = [];
    for (const [i, who] of ['l1', 'l2', 'l3'].entries()) {
      approvalIds.push(
        await id(
          `INSERT INTO leave_request_approvals (leave_request_id, approval_level, approval_cycle, approver_company_user_id, status)
           VALUES ($1,$2,1,$3,'pending') RETURNING id`,
          [requestId, i + 1, cu[who]],
        ),
      );
    }
    return { requestId, approvalIds };
  }

  /** Mirrors what the workflow records when a level approves and the next becomes active. */
  async function approveLevel(
    requestId: number,
    approvalId: number,
    nextLevel: number | null,
  ) {
    await ds.query(
      `UPDATE leave_request_approvals SET status='approved', action='approve', acted_at=now() WHERE id=$1`,
      [approvalId],
    );
    await ds.query(
      nextLevel
        ? `UPDATE leave_requests SET current_approval_level=$2, status='in_review' WHERE id=$1`
        : `UPDATE leave_requests SET status='approved', approved_at=now() WHERE id=$1`,
      nextLevel ? [requestId, nextLevel] : [requestId],
    );
  }

  beforeAll(async () => {
    if (!/(_e2e|_test_db)$/.test(process.env.DB_NAME ?? ''))
      throw new Error('Restricted to disposable *_e2e / *_test_db databases.');
    app = await createE2eApp();
    ds = app.get(DataSource);
    http = request(app.getHttpServer() as App);
    companyId = await id(
      `INSERT INTO companies (name, slug, status) VALUES ($1,$2,'active') RETURNING id`,
      [`Seq ${suffix}`, `seq-${suffix}`],
    );
    // Approvers with self scope only: their access must come from the workflow.
    const approver = [
      'leave_requests:read',
      'leave_requests:approve',
      'data_scope:self',
    ];
    await person('l1', approver);
    await person('l2', approver);
    await person('l3', approver);
    await person(
      'emp',
      ['leave_requests:read', 'leave_requests:create', 'data_scope:self'],
      'l1',
    );
    // HR oversight: sees everything, but is not an approver on these requests.
    await person('hr', [
      'leave_requests:read',
      'leave_requests:approve',
      'data_scope:company',
    ]);
    // Approve-only role (no read): queue views only.
    await person('mgmt', ['leave_requests:approve', 'data_scope:self']);
    typeId = await id(
      `INSERT INTO leave_types (company_id, name, code) VALUES ($1,'Annual Leave','AL') RETURNING id`,
      [companyId],
    );
  }, 240000);

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(`DELETE FROM leave_audit_logs WHERE company_id=$1`, [
        companyId,
      ]);
      await ds.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await app?.close();
  });

  it('level 1 pending: only level 1 sees it; later levels cannot open or act on it', async () => {
    const { requestId } = await threeLevelRequest();

    expect(await ids('l1', 'pending_my_approval')).toContain(requestId);
    expect(await ids('l2', 'pending_my_approval')).not.toContain(requestId);
    expect(await ids('l3', 'pending_my_approval')).not.toContain(requestId);
    // HR oversight lists it, but it is not waiting on HR.
    expect(await ids('hr', 'all')).toContain(requestId);
    expect(await ids('hr', 'pending_my_approval')).not.toContain(requestId);

    expect((await get('l1', `/api/leave/requests/${requestId}`)).status).toBe(
      200,
    );
    for (const who of ['l2', 'l3']) {
      expect((await get(who, `/api/leave/requests/${requestId}`)).status).toBe(
        403,
      );
    }
    // A future level cannot decide early (refused, nothing changes).
    const early = await http
      .post(`/api/leave/requests/${requestId}/approval-action`)
      .set('Authorization', `Bearer ${token.l2}`)
      .send({ action: 'approve', comments: 'Too early' });
    expect(early.status).toBeGreaterThanOrEqual(400);
    const [state] = await ds.query<
      Array<{ status: string; current_approval_level: number }>
    >(`SELECT status, current_approval_level FROM leave_requests WHERE id=$1`, [
      requestId,
    ]);
    expect(state).toEqual({
      status: 'pending_department_manager',
      current_approval_level: 1,
    });

    const [row] = (await rows('l1', 'pending_my_approval')).filter(
      (r) => r.id === requestId,
    );
    expect(row.approval_progress).toMatchObject({
      total_levels: 3,
      completed_levels: 0,
      current_position: 1,
      state: 'pending',
    });
  });

  it('moves through the levels one at a time and keeps history for decided approvers', async () => {
    const { requestId, approvalIds } = await threeLevelRequest();

    await approveLevel(requestId, approvalIds[0], 2);
    expect(await ids('l1', 'pending_my_approval')).not.toContain(requestId);
    expect(await ids('l1', 'my_approval_history')).toContain(requestId);
    expect(await ids('l2', 'pending_my_approval')).toContain(requestId);
    expect(await ids('l3', 'pending_my_approval')).not.toContain(requestId);
    expect((await get('l1', `/api/leave/requests/${requestId}`)).status).toBe(
      200,
    );
    expect((await get('l2', `/api/leave/requests/${requestId}`)).status).toBe(
      200,
    );
    expect((await get('l3', `/api/leave/requests/${requestId}`)).status).toBe(
      403,
    );

    await approveLevel(requestId, approvalIds[1], 3);
    expect(await ids('l2', 'pending_my_approval')).not.toContain(requestId);
    expect(await ids('l3', 'pending_my_approval')).toContain(requestId);
    expect((await get('l3', `/api/leave/requests/${requestId}`)).status).toBe(
      200,
    );

    await approveLevel(requestId, approvalIds[2], null);
    for (const who of ['l1', 'l2', 'l3']) {
      expect(await ids(who, 'pending_my_approval')).not.toContain(requestId);
      expect(await ids(who, 'my_approval_history')).toContain(requestId);
    }
    const [row] = (await rows('l3', 'my_approval_history')).filter(
      (r) => r.id === requestId,
    );
    expect(row.approval_progress).toMatchObject({
      total_levels: 3,
      completed_levels: 3,
      current_position: null,
      state: 'approved',
    });
  });

  it('a rejection at level 2 stops routing: level 3 never sees it', async () => {
    const { requestId, approvalIds } = await threeLevelRequest();
    await approveLevel(requestId, approvalIds[0], 2);
    await ds.query(
      `UPDATE leave_request_approvals SET status='rejected', action='reject', acted_at=now(), comments='No cover' WHERE id=$1`,
      [approvalIds[1]],
    );
    await ds.query(
      `UPDATE leave_request_approvals SET status='skipped', acted_at=now() WHERE id=$1`,
      [approvalIds[2]],
    );
    await ds.query(
      `UPDATE leave_requests SET status='rejected', rejection_reason='No cover' WHERE id=$1`,
      [requestId],
    );

    for (const who of ['l1', 'l2', 'l3']) {
      expect(await ids(who, 'pending_my_approval')).not.toContain(requestId);
    }
    expect(await ids('l2', 'my_approval_history')).toContain(requestId);
    expect(await ids('l3', 'my_approval_history')).not.toContain(requestId);
    expect((await get('l3', `/api/leave/requests/${requestId}`)).status).toBe(
      403,
    );
    const [row] = (await rows('hr', 'all')).filter((r) => r.id === requestId);
    expect(row.approval_progress).toMatchObject({
      rejected_at_position: 2,
      completed_levels: 1,
      state: 'rejected',
    });
  });

  it('counts follow the same visibility; approve-only users get queue views only', async () => {
    const { requestId } = await threeLevelRequest();
    const summary = async (who: string, view: string) => {
      const res = await get(who, `/api/leave/requests/summary?view=${view}`);
      expect(res.status).toBe(200);
      return res.body as Summary;
    };
    const l1 = await summary('l1', 'pending_my_approval');
    expect(l1.pending_my_approval).toBe(
      (await ids('l1', 'pending_my_approval')).length,
    );
    expect(l1.total).toBe(l1.pending_my_approval);
    expect((await summary('l3', 'pending_my_approval')).total).toBe(0);
    const mine = await summary('emp', 'mine');
    expect(mine.total).toBeGreaterThan(0);
    expect(mine.pending_my_approval).toBeNull();

    expect((await get('mgmt', '/api/leave/requests')).status).toBe(403);
    expect(
      (await get('mgmt', '/api/leave/requests?view=pending_my_approval'))
        .status,
    ).toBe(200);
    // The applicant never sees their own request in an approval queue.
    expect(await ids('emp', 'mine')).toContain(requestId);
    expect(
      (await get('emp', '/api/leave/requests?view=pending_my_approval')).status,
    ).toBe(403);
  });
});
