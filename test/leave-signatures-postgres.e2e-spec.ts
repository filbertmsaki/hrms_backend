/**
 * Leave Application Form e-signing over HTTP against Postgres: employee and
 * approver signing, explicit confirmation, ownership/assignment checks,
 * duplicates, signing after modification, cancelled requests, legacy
 * approvals without signatures, audit trail, and the rendered PDF text.
 *
 *   DB_NAME=hrms_frs11_e2e npm run test:e2e -- leave-signatures-postgres
 */
import './setup-e2e';
import 'reflect-metadata';
import { inflateSync } from 'zlib';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { hashPassword } from '../src/common/utils/hash.util';
import { createE2eApp } from './helpers/create-e2e-app';

type Sig = {
  id: number;
  role: string;
  approval_id: number | null;
  reference: string;
  valid: boolean;
  invalid_reason: string | null;
};

/** Text drawn by pdfkit (hex TJ strings in deflated content streams). */
function pdfText(pdf: Buffer): { pages: number; text: string } {
  const raw = pdf.toString('latin1');
  const parts: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw))) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    const tj = /\[([^\]]*)\]\s*TJ/g;
    let t: RegExpExecArray | null;
    while ((t = tj.exec(content)))
      parts.push(
        (t[1].match(/<([0-9a-fA-F]*)>/g) ?? [])
          .map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('latin1'))
          .join(''),
      );
  }
  return {
    pages: (raw.match(/\/Type \/Page\b/g) ?? []).length,
    text: parts.join('\n'),
  };
}

describe('Leave e-signing (HTTP, Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let http: ReturnType<typeof request>;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const password = 'LeaveSign!2026';
  const cu: Record<string, number> = {};
  const emp: Record<string, number> = {};
  const token: Record<string, string> = {};
  let companyId: number;
  let typeId: number;
  let seq = 0;
  const id = async (sql: string, p: unknown[]) =>
    (await ds.query<Array<{ id: number }>>(sql, p))[0].id;
  const as = (who: string) => ({
    get: (url: string) =>
      http.get(url).set('Authorization', `Bearer ${token[who]}`),
    post: (url: string, body: object = {}) =>
      http.post(url).set('Authorization', `Bearer ${token[who]}`).send(body),
  });
  const body = <T>(res: { body: unknown }): T =>
    ((res.body as { data?: T }).data ?? res.body) as T;

  async function person(key: string, permissions: string[], boss?: string) {
    seq += 1;
    const email = `${key}-${suffix}@example.test`;
    const user = await id(
      `INSERT INTO users (user_no, first_name, last_name, phone, email, password, status, user_type, is_email_verified, auth_token_version)
       VALUES ($1,$2,'Signer',$3,$4,$5,'active','COMPANY_USER',true,1) RETURNING id`,
      [
        `S${seq}-${suffix.slice(-10)}`,
        key,
        `+2555${String(seq).padStart(2, '0')}${suffix.slice(-7)}`,
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
       VALUES ($1,$2,$3,$4,'Signer','female',1,$5,'2020-01-01','active') RETURNING id`,
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

  async function leaveRequest(
    status: string,
    approvals: Array<[string, string]>,
  ) {
    const requestId = await id(
      `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, leave_no, start_date, end_date, total_days, reason,
         created_by_company_user_id, version, status, current_approval_level, approval_cycle)
       VALUES ($1,$2,$3,$4,'2026-11-02','2026-11-03',2,'Unwell',$5,1,$6,1,1) RETURNING id`,
      [
        companyId,
        emp.emp,
        typeId,
        `SIG-${seq++}-${suffix}`.slice(0, 50),
        cu.emp,
        status,
      ],
    );
    const ids: number[] = [];
    for (const [i, [who, st]] of approvals.entries()) {
      ids.push(
        await id(
          `INSERT INTO leave_request_approvals (leave_request_id, approval_level, approval_cycle, approver_company_user_id, status, acted_at, comments)
           VALUES ($1,$2,1,$3,$4,$5,$6) RETURNING id`,
          [
            requestId,
            i + 1,
            cu[who],
            st,
            st === 'pending' ? null : new Date('2026-11-04T08:00:00Z'),
            st === 'pending' ? null : 'Checked.',
          ],
        ),
      );
    }
    await ds.query(
      `INSERT INTO leave_medical_details (leave_request_id, sickness_nature, hospital_name, treatment_start_date, treatment_end_date)
       VALUES ($1,'Malaria','Test Hospital','2026-11-02','2026-11-03')`,
      [requestId],
    );
    return { requestId, approvalIds: ids };
  }

  beforeAll(async () => {
    if (!/(_e2e|_test_db)$/.test(process.env.DB_NAME ?? ''))
      throw new Error('Restricted to disposable *_e2e / *_test_db databases.');
    app = await createE2eApp();
    ds = app.get(DataSource);
    http = request(app.getHttpServer() as App);
    companyId = await id(
      `INSERT INTO companies (name, slug, status) VALUES ($1,$2,'active') RETURNING id`,
      [`Sign ${suffix}`, `sign-${suffix}`],
    );
    await person('mgr', [
      'leave_requests:read',
      'leave_requests:approve',
      'data_scope:team',
    ]);
    await person(
      'emp',
      ['leave_requests:read', 'leave_requests:create', 'data_scope:self'],
      'mgr',
    );
    await person(
      'peer',
      ['leave_requests:read', 'leave_requests:create', 'data_scope:self'],
      'mgr',
    );
    await person('hr', [
      'leave_requests:read',
      'leave_requests:approve',
      'data_scope:company',
    ]);
    typeId = await id(
      `INSERT INTO leave_types (company_id, name, code) VALUES ($1,'Sick Leave','SL') RETURNING id`,
      [companyId],
    );
  }, 240000);

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(`DELETE FROM leave_signatures WHERE company_id=$1`, [
        companyId,
      ]);
      await ds.query(`DELETE FROM leave_audit_logs WHERE company_id=$1`, [
        companyId,
      ]);
      await ds.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await app?.close();
  });

  it('employee signs once with explicit confirmation; others cannot sign for them', async () => {
    const { requestId } = await leaveRequest('pending_hr', [
      ['mgr', 'approved'],
      ['hr', 'pending'],
    ]);
    const url = `/api/leave/requests/${requestId}/sign`;
    expect((await as('emp').post(url, {})).status).toBe(400);
    expect((await as('emp').post(url, { confirm: false })).status).toBe(400);
    expect((await as('peer').post(url, { confirm: true })).status).toBe(403);
    expect((await as('mgr').post(url, { confirm: true })).status).toBe(403);
    const signed = await as('emp').post(url, { confirm: true });
    expect(signed.status).toBe(201);
    const sig = body<Sig>(signed);
    expect(sig).toMatchObject({ role: 'EMPLOYEE', valid: true });
    expect(sig.reference).toMatch(/^LSG-[0-9A-F]{10}$/);
    expect((await as('emp').post(url, { confirm: true })).status).toBe(409);
    const [audit] = await ds.query<Array<{ n: number }>>(
      `SELECT count(*)::int n FROM leave_audit_logs WHERE leave_request_id=$1 AND action='leave_request.signed_by_employee'`,
      [requestId],
    );
    expect(audit.n).toBe(1);
  });

  it('approvers sign only their own decided stage, once', async () => {
    const { requestId, approvalIds } = await leaveRequest('pending_hr', [
      ['mgr', 'approved'],
      ['hr', 'pending'],
    ]);
    const sign = (who: string, approvalId: number) =>
      as(who).post(
        `/api/leave/requests/${requestId}/approvals/${approvalId}/sign`,
        { confirm: true },
      );
    expect((await sign('emp', approvalIds[0])).status).toBe(403); // no approve permission
    expect((await sign('hr', approvalIds[0])).status).toBe(403); // not the assigned officer
    expect((await sign('hr', approvalIds[1])).status).toBe(409); // decision not recorded yet
    const ok = await sign('mgr', approvalIds[0]);
    expect(ok.status).toBe(201);
    expect(body<Sig>(ok)).toMatchObject({
      role: 'APPROVER',
      approval_id: approvalIds[0],
      valid: true,
    });
    expect((await sign('mgr', approvalIds[0])).status).toBe(409); // duplicate
  });

  it('a change to the application invalidates the signature and allows re-signing', async () => {
    const { requestId } = await leaveRequest('pending_hr', [
      ['mgr', 'approved'],
    ]);
    const url = `/api/leave/requests/${requestId}/sign`;
    const first = body<Sig>(await as('emp').post(url, { confirm: true }));
    await ds.query(
      `UPDATE leave_requests SET end_date='2026-11-04', total_days=3 WHERE id=$1`,
      [requestId],
    );
    const list = body<Sig[]>(
      await as('emp').get(`/api/leave/requests/${requestId}/signatures`),
    );
    expect(list.find((s) => s.id === first.id)).toMatchObject({
      valid: false,
      invalid_reason: 'Application changed after signing',
    });
    const second = body<Sig>(await as('emp').post(url, { confirm: true }));
    expect(second.valid).toBe(true);
    const after = body<Sig[]>(
      await as('emp').get(`/api/leave/requests/${requestId}/signatures`),
    );
    expect(after.find((s) => s.id === first.id)?.invalid_reason).toBe(
      'Superseded by a later signature',
    );
    // History is preserved, never deleted.
    expect(after).toHaveLength(2);
  });

  it('cancelled applications cannot be signed; rejected decisions can be signed by their officer', async () => {
    const cancelled = await leaveRequest('cancelled', [['mgr', 'approved']]);
    expect(
      (
        await as('emp').post(
          `/api/leave/requests/${cancelled.requestId}/sign`,
          { confirm: true },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await as('mgr').post(
          `/api/leave/requests/${cancelled.requestId}/approvals/${cancelled.approvalIds[0]}/sign`,
          { confirm: true },
        )
      ).status,
    ).toBe(409);
    const rejected = await leaveRequest('rejected', [['mgr', 'rejected']]);
    expect(
      (
        await as('emp').post(`/api/leave/requests/${rejected.requestId}/sign`, {
          confirm: true,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await as('mgr').post(
          `/api/leave/requests/${rejected.requestId}/approvals/${rejected.approvalIds[0]}/sign`,
          { confirm: true },
        )
      ).status,
    ).toBe(201);
  });

  it('signature lists are scoped like the request', async () => {
    const { requestId } = await leaveRequest('pending_hr', [
      ['mgr', 'approved'],
    ]);
    expect(
      (await as('peer').get(`/api/leave/requests/${requestId}/signatures`))
        .status,
    ).toBe(403);
    expect(
      (await as('mgr').get(`/api/leave/requests/${requestId}/signatures`))
        .status,
    ).toBe(200);
  });

  it('PDF shows verified signatures, legacy approvals honestly, and keeps section G on medical leave', async () => {
    const { requestId, approvalIds } = await leaveRequest('approved', [
      ['mgr', 'approved'],
      ['hr', 'approved'],
    ]);
    await ds.query(
      `UPDATE leave_request_approvals SET comments='Balance verified by HR.' WHERE id=$1`,
      [approvalIds[1]],
    );
    const unsignedPdf = await as('hr')
      .get(`/api/leave/requests/${requestId}/pdf`)
      .buffer(true);
    expect(unsignedPdf.status).toBe(200);
    const before = pdfText(unsignedPdf.body as Buffer);
    expect(before.pages).toBe(1);
    expect(before.text).toMatch(/Employee Signature:\s*Pending/);
    expect(before.text).toContain(
      'Approval Recorded — Signature Not Available'.replace('—', '\u0097'),
    );

    const empSig = body<Sig>(
      await as('emp').post(`/api/leave/requests/${requestId}/sign`, {
        confirm: true,
      }),
    );
    const mgrSig = body<Sig>(
      await as('mgr').post(
        `/api/leave/requests/${requestId}/approvals/${approvalIds[0]}/sign`,
        { confirm: true },
      ),
    );
    const after = pdfText(
      (await as('hr').get(`/api/leave/requests/${requestId}/pdf`).buffer(true))
        .body as Buffer,
    );
    expect(after.pages).toBe(1);
    expect(after.text).toContain('Electronically signed by:');
    expect(after.text).toContain(empSig.reference);
    if (!after.text.includes(mgrSig.reference)) {
      expect(after.text).toContain('level 1 in HRMS');
      expect(after.text).toMatch(
        /Additional details and approval history\s+are available in HRMS\./,
      );
      const signatures = body<Sig[]>(
        await as('hr').get(`/api/leave/requests/${requestId}/signatures`),
      );
      expect(signatures).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ reference: mgrSig.reference, valid: true }),
        ]),
      );
    }
    expect(after.text).toContain('C. MEDICAL LEAVE INFORMATION');
    expect(after.text).toContain('G. FOR HR / PERSONNEL DEPARTMENT USE');
    expect(after.text).toContain('Balance verified by HR.');
    expect(after.text).toContain('H. FINAL AUTHORIZATION');
    expect(after.text).not.toMatch(/Not verified/);
  });
});
