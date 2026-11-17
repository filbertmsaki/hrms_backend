/**
 * FRS-11 HTTP-level authorization: real login, real JWT strategy, guards,
 * controllers and services against Postgres. Each user gets exactly the
 * direct permissions listed below, nothing from seeded roles.
 *
 *   DB_NAME=hrms_frs11_e2e npm run test:e2e -- leave-http-authorization
 */
import './setup-e2e';
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { hashPassword } from '../src/common/utils/hash.util';
import { createE2eApp } from './helpers/create-e2e-app';

const EMPLOYEE = [
  'leave_requests:read',
  'leave_requests:create',
  'leave_requests:cancel',
  'data_scope:self',
];
const MANAGER = [
  'leave_requests:read',
  'leave_requests:approve',
  'data_scope:team',
];
const HR = [
  'leave_requests:read',
  'leave_requests:approve',
  'leave_requests:override',
  'leave-balances.view',
  'leave-balances.adjust',
  'leave-balances.manage',
  'leave_reports.view',
  'data_scope:company',
  'leave_policies:read',
  'leave_policies:update',
  'leave_policies:approve',
];

describe('Leave HTTP authorization (real login, guards and Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let http: ReturnType<typeof request>;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const password = 'LeaveAuthz!2026';
  const co: Record<string, number> = {};
  const cu: Record<string, number> = {};
  const emp: Record<string, number> = {};
  const token: Record<string, string> = {};
  let seq = 0;
  let sickRequest: number;
  let coType: number;
  let overtimeId: number;
  const id = async (sql: string, p: unknown[]) =>
    (await ds.query(sql, p))[0].id;
  const as = (who: string) => ({
    get: (url: string) =>
      http.get(url).set('Authorization', `Bearer ${token[who]}`),
    post: (url: string, body: object = {}) =>
      http.post(url).set('Authorization', `Bearer ${token[who]}`).send(body),
    put: (url: string, body: object = {}) =>
      http.put(url).set('Authorization', `Bearer ${token[who]}`).send(body),
    patch: (url: string, body: object = {}) =>
      http.patch(url).set('Authorization', `Bearer ${token[who]}`).send(body),
  });

  async function person(
    key: string,
    company: string,
    permissions: string[],
    reportsTo?: string,
  ) {
    seq += 1;
    const email = `${key}-${suffix}@example.test`;
    const user = await id(
      `INSERT INTO users (user_no, first_name, last_name, phone, email, password, status, user_type, is_email_verified, auth_token_version)
       VALUES ($1,$2,'Authz',$3,$4,$5,'active','COMPANY_USER',true,1) RETURNING id`,
      [
        `H${seq}-${suffix.slice(-10)}`,
        key,
        `+2556${String(seq).padStart(2, '0')}${suffix.slice(-7)}`,
        email,
        await hashPassword(password),
      ],
    );
    cu[key] = await id(
      `INSERT INTO company_users (company_id, user_id, status, is_default) VALUES ($1,$2,'active',true) RETURNING id`,
      [co[company], user],
    );
    emp[key] = await id(
      `INSERT INTO employees (company_id, company_user_id, employee_no, first_name, last_name, gender, version, reports_to, hire_date, employment_status, employment_type)
       VALUES ($1,$2,$3,$4,'Authz','female',1,$5,'2020-01-01','active','full_time') RETURNING id`,
      [
        co[company],
        cu[key],
        `${key}-${suffix}`.slice(0, 50),
        key,
        reportsTo ? emp[reportsTo] : null,
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
    expect([200, 201]).toContain(res.status);
    token[key] = res.body.access_token;
    expect(token[key]).toBeDefined();
  }

  beforeAll(async () => {
    if (!/_e2e$/.test(process.env.DB_NAME ?? ''))
      throw new Error('Restricted to *_e2e databases.');
    app = await createE2eApp();
    ds = app.get(DataSource);
    http = request(app.getHttpServer() as App);
    for (const k of ['A', 'B']) {
      co[k] = await id(
        `INSERT INTO companies (name, slug, status) VALUES ($1,$2,'active') RETURNING id`,
        [`Http ${k} ${suffix}`, `http-${k.toLowerCase()}-${suffix}`],
      );
    }
    await person('mgr', 'A', MANAGER);
    await person('emp', 'A', EMPLOYEE, 'mgr');
    await person('peer', 'A', EMPLOYEE, 'mgr');
    await person('hr', 'A', HR);
    await person('hr2', 'A', HR);
    await person('hrB', 'B', HR);

    const sick = await id(
      `INSERT INTO leave_types (company_id, name, code) VALUES ($1,'Sick Leave','SL') RETURNING id`,
      [co.A],
    );
    sickRequest = await id(
      `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, leave_no, start_date, end_date, total_days, reason,
         created_by_company_user_id, version, status, current_approval_level, approval_cycle)
       VALUES ($1,$2,$3,$4,'2026-11-02','2026-11-03',2,'Unwell',$5,1,'pending_department_manager',1,1) RETURNING id`,
      [co.A, emp.emp, sick, `HTTP-${suffix}`.slice(0, 50), cu.emp],
    );
    await ds.query(
      `INSERT INTO leave_request_approvals (leave_request_id, approval_level, approval_cycle, approver_company_user_id, status) VALUES ($1,1,1,$2,'pending')`,
      [sickRequest, cu.mgr],
    );
    await ds.query(
      `INSERT INTO leave_medical_details (leave_request_id, sickness_nature, doctor_name, hospital_name, treatment_start_date)
       VALUES ($1,'Malaria','Dr Test','Test Hospital','2026-11-02')`,
      [sickRequest],
    );
    coType = await id(
      `INSERT INTO leave_types (company_id, name, code, max_days_per_year) VALUES ($1,'Comp off','CO',0) RETURNING id`,
      [co.A],
    );
    overtimeId = await id(
      `INSERT INTO payroll_overtime_requests (company_id, employee_id, work_date, requested_minutes, reason, status)
       VALUES ($1,$2,'2026-11-07',480,'Stock count','APPROVED') RETURNING id`,
      [co.A, emp.emp],
    );
  }, 240000);

  afterAll(async () => {
    if (ds?.isInitialized) {
      for (const t of [
        'leave_comp_off_credits',
        'leave_comp_off_policies',
        'leave_balance_adjustments',
        'leave_balance_transactions',
        'leave_audit_logs',
      ])
        await ds.query(`DELETE FROM ${t} WHERE company_id = ANY($1)`, [
          [co.A, co.B],
        ]);
      await ds.query(`DELETE FROM companies WHERE id = ANY($1)`, [
        [co.A, co.B],
      ]);
    }
    await app?.close();
  });

  it('requires authentication', async () => {
    expect((await http.get(`/api/leave/requests/${sickRequest}`)).status).toBe(
      401,
    );
  });

  it('employee reads own request; a colleague is refused', async () => {
    expect(
      (await as('emp').get(`/api/leave/requests/${sickRequest}`)).status,
    ).toBe(200);
    expect(
      (await as('peer').get(`/api/leave/requests/${sickRequest}`)).status,
    ).toBe(403);
  });

  it('medical detail: employee and HR see it, the manager gets it redacted', async () => {
    const body = (who: string) =>
      as(who)
        .get(`/api/leave/requests/${sickRequest}`)
        .then((r) => r.body.data ?? r.body);
    expect((await body('emp')).medical_detail.sickness_nature).toBe('Malaria');
    expect((await body('hr')).medical_detail.sickness_nature).toBe('Malaria');
    const m = (await body('mgr')).medical_detail;
    expect(m).toMatchObject({
      sickness_nature: null,
      doctor_name: null,
      hospital_name: null,
      redacted: true,
    });
    expect(String(m.treatment_start_date)).toContain('2026-11-02');
  });

  it('manager cannot write medical detail', async () => {
    expect(
      (
        await as('mgr').patch(
          `/api/leave/requests/${sickRequest}/medical-detail`,
          { sickness_nature: 'x' },
        )
      ).status,
    ).toBe(403);
  });

  it('another company cannot see the request or its PDF', async () => {
    expect([403, 404]).toContain(
      (await as('hrB').get(`/api/leave/requests/${sickRequest}`)).status,
    );
    expect([403, 404]).toContain(
      (await as('hrB').get(`/api/leave/requests/${sickRequest}/pdf`)).status,
    );
    expect(
      (await as('peer').get(`/api/leave/requests/${sickRequest}/pdf`)).status,
    ).toBe(403);
  });

  it('employee cannot approve (no permission); rejection needs a reason', async () => {
    expect(
      (
        await as('emp').post(
          `/api/leave/requests/${sickRequest}/approval-action`,
          { action: 'APPROVE' },
        )
      ).status,
    ).toBe(403);
    const res = await as('mgr').post(
      `/api/leave/requests/${sickRequest}/approval-action`,
      { action: 'REJECT' },
    );
    expect(res.status).toBe(400);
  });

  it('encashment list is scoped; balance adjustment and reports need HR permissions', async () => {
    expect((await as('emp').get('/api/leave/encashments')).status).toBe(200);
    expect(
      (await as('emp').patch('/api/leave/balances/adjust', {})).status,
    ).toBe(403);
    expect(
      (await as('emp').get('/api/leave/reports/balances?format=json')).status,
    ).toBe(403);
    expect(
      (await as('hr').get('/api/leave/reports/balances?format=json')).status,
    ).toBe(200);
  });

  describe('comp-off API', () => {
    it('is disabled until HR approves a policy (four-eyes)', async () => {
      const body = { leave_type_id: coType, overtime_request_id: overtimeId };
      expect(
        (await as('emp').post('/api/leave/comp-off/credits', body)).status,
      ).toBe(400);
      await ds.query(
        `UPDATE leave_types SET comp_off_enabled=true WHERE id=$1`,
        [coType],
      );
      const eligibility = await as('emp').get(
        '/api/leave/comp-off/eligibility',
      );
      expect(eligibility.status).toBe(200);
      const t = (eligibility.body.data ?? eligibility.body).types.find(
        (x: { id: number }) => x.id === coType,
      );
      expect(t).toMatchObject({ earning_enabled: false });
      expect(
        (
          await as('emp').put('/api/leave/comp-off/policies', {
            leave_type_id: coType,
            hours_per_day: 8,
            requires_approval: true,
            expiry_days: 90,
          })
        ).status,
      ).toBe(403);
      const saved = await as('hr').put('/api/leave/comp-off/policies', {
        leave_type_id: coType,
        hours_per_day: 8,
        requires_approval: true,
        expiry_days: 90,
      });
      expect(saved.status).toBe(200);
      const policyId = (saved.body.data ?? saved.body).id;
      expect(
        (await as('emp').post('/api/leave/comp-off/credits', body)).status,
      ).toBe(400);
      expect(
        (
          await as('hr').post(
            `/api/leave/comp-off/policies/${policyId}/approve`,
          )
        ).status,
      ).toBe(403);
      expect([200, 201]).toContain(
        (
          await as('hr2').post(
            `/api/leave/comp-off/policies/${policyId}/approve`,
          )
        ).status,
      );
    });

    it('employee requests for own overtime only; manager approves; scoping holds', async () => {
      const own = await as('emp').post('/api/leave/comp-off/credits', {
        leave_type_id: coType,
        overtime_request_id: overtimeId,
      });
      expect(own.status).toBe(201);
      const creditId = (own.body.data ?? own.body).credit.id;
      expect(
        (
          await as('emp').post('/api/leave/comp-off/credits', {
            leave_type_id: coType,
            overtime_request_id: overtimeId,
            employee_id: emp.peer,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await as('emp').post(
            `/api/leave/comp-off/credits/${creditId}/decision`,
            { approve: true },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await as('hrB').post(
            `/api/leave/comp-off/credits/${creditId}/decision`,
            { approve: true },
          )
        ).status,
      ).toBe(404);
      const pending = await as('mgr').get('/api/leave/comp-off/pending');
      expect(
        (pending.body.data ?? pending.body).map((c: { id: number }) => c.id),
      ).toContain(creditId);
      const approved = await as('mgr').post(
        `/api/leave/comp-off/credits/${creditId}/decision`,
        { approve: true },
      );
      expect([200, 201]).toContain(approved.status);
      expect((approved.body.data ?? approved.body).status).toBe('credited');
      expect(
        (
          await as('peer').get(
            `/api/leave/comp-off/credits?employee_id=${emp.emp}`,
          )
        ).status,
      ).toBe(403);
      const mine = await as('emp').get('/api/leave/comp-off/credits');
      expect(
        (mine.body.data ?? mine.body).map((c: { id: number }) => c.id),
      ).toEqual([creditId]);
      const other = await as('hrB').get('/api/leave/comp-off/credits');
      expect(other.body.data ?? other.body).toEqual([]);
      const history = await as('emp').get(
        `/api/leave/comp-off/credits/${creditId}/history`,
      );
      expect(history.status).toBe(200);
      expect(
        (history.body.data ?? history.body).audit.map(
          (a: { action: string }) => a.action,
        ),
      ).toEqual(
        expect.arrayContaining([
          'leave_comp_off.requested',
          'leave_comp_off.approved',
        ]),
      );
      expect(
        (
          await as('emp').post(
            `/api/leave/comp-off/credits/${creditId}/reverse`,
            { reason: 'Not allowed' },
          )
        ).status,
      ).toBe(403);
    });
  });
});
