process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { hashPassword } from '../src/common/utils/hash.util';
import { Company } from '../src/modules/companies/entities/company.entity';
import { CompanyUser } from '../src/modules/companies/entities/company-user.entity';
import { CompanyUserPermission } from '../src/modules/companies/entities/company-user-permission.entity';
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import { Permission } from '../src/modules/permissions/entities/permission.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { Role } from '../src/modules/roles/entities/role.entity';
import { COMPANY_ROLE_SEEDS } from '../src/database/seeds/005-company-roles.seed';
import { effectivePermissions } from '../src/common/utils/permission.util';
import { ProbationReminderService } from '../src/modules/hr/probation/services/probation-reminder.service';
import { EmployeePayrollCalculationService } from '../src/modules/hr/payroll/services/payroll-core.services';
import { EmployeePayrollProfile } from '../src/modules/hr/payroll/entities/employee-payroll-profile.entity';
import {
  PayrollCalendar,
  PayrollPeriod,
  StatutoryScheme,
  StatutoryRuleVersion,
} from '../src/modules/hr/payroll/entities/payroll-configuration.entities';
import { PayrollRun } from '../src/modules/hr/payroll/entities/payroll-run.entities';
import {
  PayrollRunTypeEnum,
  PayrollCalculationMethodEnum,
  StatutorySchemeTypeEnum,
} from '../src/modules/hr/payroll/payroll.enums';
import { EmploymentStatusEnum } from '../src/modules/hr/employees/enums/employment-status.enum';
import {
  EmployeeCompensationVersion,
  EmployeeCompensationVersionStatusEnum,
} from '../src/modules/hr/employee-movements/entities/employee-compensation-version.entity';
import { createE2eApp } from './helpers/create-e2e-app';

/**
 * Proves PermissionsGuard is enforced on every request from the real
 * database, not cached in the JWT: granting a permission takes effect on
 * the very next request without a new login, and revoking one blocks
 * access immediately -- an admin removing access mid-session must actually
 * work, not just look like it worked in the admin UI.
 */
describe('Permission matrix (e2e, real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let companyId: number;
  let userId: number;
  let companyUserId: number;
  let employeeId: number;
  let employeesReadPermissionId: number;
  let dataScopeCompanyPermissionId: number;
  const password = 'PermissionMatrix!2026';
  let email: string;
  let token: string;

  beforeAll(async () => {
    app = await createE2eApp();
    jest.spyOn(app.get(MailerService), 'sendMail').mockResolvedValue({
      messageId: 'fixture',
      response: 'Accepted by test mail transport',
    });
    dataSource = app.get(DataSource);

    const employeesRead = await dataSource
      .getRepository(Permission)
      .findOneOrFail({ where: { name: 'employees:read' } });
    employeesReadPermissionId = employeesRead.id;

    const dataScopeCompany = await dataSource
      .getRepository(Permission)
      .findOneOrFail({ where: { name: 'data_scope:company' } });
    dataScopeCompanyPermissionId = dataScopeCompany.id;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    if (companyId) {
      await dataSource.query(
        'DELETE FROM probation_letter_templates WHERE company_id = $1',
        [companyId],
      );
    }
    if (employeeId) {
      await dataSource.query('DELETE FROM employees WHERE id = $1', [
        employeeId,
      ]);
    }
    if (companyUserId) {
      await dataSource.query(
        'DELETE FROM company_user_permissions WHERE company_user_id = $1',
        [companyUserId],
      );
      await dataSource.query('DELETE FROM company_users WHERE id = $1', [
        companyUserId,
      ]);
    }
    if (userId) {
      await dataSource.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    if (companyId) {
      await dataSource.query('DELETE FROM companies WHERE id = $1', [
        companyId,
      ]);
    }
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    email = `permission.matrix.${suffix}@example.com`;

    const company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Permission Matrix Co ${suffix}`,
        slug: `e2e-permission-matrix-${suffix}`,
        status: 'active',
      }),
    );
    companyId = company.id;

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-PM-${suffix}`.slice(0, 20),
        first_name: 'Permission',
        last_name: 'Matrix',
        phone: `+2553${suffix}`.slice(0, 20),
        email,
        password: await hashPassword(password),
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
        auth_token_version: 1,
      }),
    );
    userId = user.id;

    const membership = await dataSource.getRepository(CompanyUser).save(
      dataSource.getRepository(CompanyUser).create({
        company_id: companyId,
        user_id: userId,
        status: 'active',
        is_default: true,
      }),
    );
    companyUserId = membership.id;

    const employee = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: companyId,
        company_user_id: companyUserId,
        employee_no: `EMP-PM-${suffix}`.slice(0, 50),
        first_name: 'Permission',
        last_name: 'Matrix',
        gender: 'female',
      }),
    );
    employeeId = employee.id;

    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    token = response.body.access_token as string;
  });

  async function grantPermission(permissionId: number): Promise<void> {
    await dataSource.getRepository(CompanyUserPermission).save(
      dataSource.getRepository(CompanyUserPermission).create({
        company_user_id: companyUserId,
        permission_id: permissionId,
      }),
    );
  }

  async function revokePermission(permissionId: number): Promise<void> {
    await dataSource.query(
      'DELETE FROM company_user_permissions WHERE company_user_id = $1 AND permission_id = $2',
      [companyUserId, permissionId],
    );
  }

  it('keeps personal insights and the real team recommendation lifecycle within employee, tenant and reviewer scope', async () => {
    const http = request(app.getHttpServer() as App);
    const auth = 'Bearer ' + token;
    const team = '/api/me/team/recommendations',
      hr = '/api/hr/recommendations',
      insights = '/api/me/insights';
    const employees = dataSource.getRepository(Employee);
    const people = dataSource.getRepository(User);
    const memberships = dataSource.getRepository(CompanyUser);
    const grants = dataSource.getRepository(CompanyUserPermission);
    const addGrant = async (memberId: number, name: string) => {
      const p = await dataSource
        .getRepository(Permission)
        .findOneByOrFail({ name });
      await grants.save({ company_user_id: memberId, permission_id: p.id });
      return p.id;
    };
    const addEmployee = (
      label: string,
      reports_to: number | null,
      tenant = companyId,
    ) =>
      employees.save(
        employees.create({
          company_id: tenant,
          employee_no: 'REC-' + label,
          first_name: label,
          last_name: 'Fixture',
          gender: 'female',
          reports_to,
          employment_status: EmploymentStatusEnum.ACTIVE,
        }),
      );
    const foreign = await dataSource
      .getRepository(Company)
      .save({
        name: 'Recommendation tenant ' + companyId,
        slug: 'recommendation-fixture-' + companyId,
        status: 'active',
      });
    const other = await addEmployee('Other tenant', null, foreign.id);
    const direct = await addEmployee('Direct', employeeId),
      indirect = await addEmployee('Indirect', direct.id),
      peer = await addEmployee('Peer', null);
    const inactive = await addEmployee('Former', employeeId);
    await employees.update(inactive.id, {
      employment_status: EmploymentStatusEnum.INACTIVE,
    });
    const reviewer = await people.save(
      people.create({
        user_no: 'REC-HR-' + companyId,
        first_name: 'Review',
        last_name: 'Fixture',
        email: `rec-hr-${companyId}@example.test`,
        phone: '+2559' + String(companyId).padStart(8, '0'),
        user_type: 'COMPANY_USER',
        password: await hashPassword(password),
        status: 'active',
        is_email_verified: true,
        auth_token_version: 1,
      }),
    );
    const member = await memberships.save({
      company_id: companyId,
      user_id: reviewer.id,
      status: 'active',
      is_default: true,
    });
    try {
      await http.get(insights).expect(401);
      await dataSource.query(
        `INSERT INTO attendance_daily_summaries(company_id,employee_id,attendance_date,schedule_source,attendance_status)
        VALUES ($1,$2,CURRENT_DATE-1,'MANUAL','PRESENT'),($1,$3,CURRENT_DATE-1,'MANUAL','ABSENT'),($1,$2,CURRENT_DATE-40,'MANUAL','ABSENT')`,
        [companyId, employeeId, peer.id],
      );
      const personal = await http
        .get(insights)
        .query({ employee_id: peer.id })
        .set('Authorization', auth)
        .expect(200);
      expect(personal.body.attendance).toMatchObject({
        total_days: 1,
        present_days: 1,
        absent_days: 0,
      });
      expect(personal.body.leave.pending_total).toBe(0);
      await http
        .get(team + '/options')
        .set('Authorization', auth)
        .expect(403);
      await http
        .get(hr + '/pending')
        .set('Authorization', auth)
        .expect(403);
      await addGrant(companyUserId, 'manager_recommendations:submit');
      await addGrant(companyUserId, 'data_scope:company');
      const options = await http
        .get(team + '/options')
        .set('Authorization', auth)
        .expect(200);
      expect(
        options.body.employees.map((e: { id: number }) => e.id).sort(),
      ).toEqual([direct.id, indirect.id].sort());
      const body = {
        employee_id: indirect.id,
        recommendation_type: 'PROMOTION',
        rationale: 'Ready for a wider remit after leading the project.',
        proposal: { proposed_position_title: 'Senior analyst' },
      };
      for (const denied of [employeeId, peer.id, other.id])
        await http
          .post(team)
          .set('Authorization', auth)
          .send({ ...body, employee_id: denied })
          .expect(403);
      await http
        .post(team)
        .set('Authorization', auth)
        .send({ ...body, employee_id: inactive.id })
        .expect(400);
      await http
        .post(team)
        .set('Authorization', auth)
        .send({
          ...body,
          recommendation_type: 'TRANSFER',
          proposal: { proposed_department_id: 2147483647 },
        })
        .expect(400);
      await http
        .post(team)
        .set('Authorization', auth)
        .send({ ...body, recommendation_type: 'DISCIPLINARY' })
        .expect(400);
      const original = await http
        .post(team)
        .set('Authorization', auth)
        .send(body)
        .expect(201);
      const id = Number(original.body.id);
      await addGrant(companyUserId, 'manager_recommendations:review');
      await http
        .get(hr + '/pending')
        .set('Authorization', auth)
        .expect(200)
        .expect({ data: [] });
      await http
        .post(hr + '/' + id + '/decision')
        .set('Authorization', auth)
        .send({ decision: 'APPROVE' })
        .expect(404);
      const login = await http
        .post('/api/auth/login')
        .send({ email: reviewer.email, password })
        .expect(201);
      const reviewerAuth = 'Bearer ' + String(login.body.access_token);
      await http.get(insights).set('Authorization', reviewerAuth).expect(404);
      await addGrant(member.id, 'manager_recommendations:review');
      await addGrant(member.id, 'data_scope:self');
      await http
        .get(hr + '/pending')
        .set('Authorization', reviewerAuth)
        .expect(200)
        .expect({ data: [] });
      await http
        .post(hr + '/' + id + '/decision')
        .set('Authorization', reviewerAuth)
        .send({ decision: 'APPROVE' })
        .expect(404);
      await employees.update(indirect.id, { company_user_id: member.id });
      await addGrant(member.id, 'data_scope:company');
      await http
        .get(hr + '/pending')
        .set('Authorization', reviewerAuth)
        .expect(200)
        .expect({ data: [] });
      await employees.update(indirect.id, { company_user_id: null });
      const queue = await http
        .get(hr + '/pending')
        .set('Authorization', reviewerAuth)
        .expect(200);
      expect(queue.body.data).toEqual([
        expect.objectContaining({
          id,
          employee_id: indirect.id,
          submitted_by: expect.stringContaining('Permission Matrix'),
        }),
      ]);
      await http
        .post(hr + '/' + id + '/decision')
        .set('Authorization', reviewerAuth)
        .send({ decision: 'RETURN' })
        .expect(400);
      await http
        .post(hr + '/' + id + '/decision')
        .set('Authorization', reviewerAuth)
        .send({ decision: 'RETURN', comment: 'Please add examples.' })
        .expect(201);
      const personalList = await http
        .get(team)
        .set('Authorization', auth)
        .expect(200);
      expect(personalList.body.data[0]).toMatchObject({
        id,
        status: 'RETURNED',
        feedback: 'Please add examples.',
      });
      const edit = {
        ...body,
        rationale: 'Delivered the pilot and trained the next project team.',
        revises_id: id,
      };
      const revised = await http
        .post(team)
        .set('Authorization', auth)
        .send(edit)
        .expect(201);
      await http.post(team).set('Authorization', auth).send(edit).expect(409);
      const decisions = await Promise.all(
        ['APPROVE', 'REJECT'].map((decision) =>
          http
            .post(hr + '/' + String(revised.body.id) + '/decision')
            .set('Authorization', reviewerAuth)
            .send({ decision, comment: 'Reviewed with evidence.' }),
        ),
      );
      expect(decisions.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(
        (await employees.findOneByOrFail({ id: indirect.id }))
          .primary_position_id,
      ).toBeNull();
      const branch = (await dataSource.query(
        "INSERT INTO branches(company_id,name) VALUES ($1,'Proposal destination') RETURNING id",
        [companyId],
      )) as { id: number }[];
      const transferred = await http
        .post(team)
        .set('Authorization', auth)
        .send({
          ...body,
          recommendation_type: 'TRANSFER',
          proposal: { proposed_branch_id: branch[0].id },
        })
        .expect(201);
      await http
        .post(hr + '/' + String(transferred.body.id) + '/decision')
        .set('Authorization', reviewerAuth)
        .send({ decision: 'REJECT', comment: 'Current placement continues.' })
        .expect(201);
      await http
        .post(team)
        .set('Authorization', auth)
        .send({ ...body, recommendation_type: 'DISCIPLINARY', proposal: {} })
        .expect(201);
      await addGrant(companyUserId, 'manager_self_service:read');
      await http
        .get('/api/manager/recommendations/mine')
        .set('Authorization', auth)
        .expect(404);
      await dataSource.query(
        "UPDATE companies SET metadata=jsonb_build_object('demo',true,'demo_recommendations_enabled',true) WHERE id=$1",
        [companyId],
      );
      const demo = await http
        .post('/api/manager/recommendations')
        .set('Authorization', auth)
        .send(body)
        .expect(201);
      const demoList = await http
        .get('/api/manager/recommendations/mine')
        .set('Authorization', auth)
        .expect(200);
      expect(demoList.body.data).toHaveLength(1);
      expect(demoList.body.data[0].id).toBe(demo.body.id);
      expect(
        (await http.get(team).set('Authorization', auth).expect(200)).body.data,
      ).toHaveLength(4);
      await employees.update(direct.id, { reports_to: null });
      await http
        .get(team)
        .set('Authorization', auth)
        .expect(200)
        .expect({ data: [] });
    } finally {
      await dataSource.query(
        'DELETE FROM team_recommendations WHERE company_id=$1 AND revises_id IS NOT NULL',
        [companyId],
      );
      await dataSource.query(
        'DELETE FROM team_recommendations WHERE company_id=$1',
        [companyId],
      );
      await dataSource.query(
        'DELETE FROM manager_recommendations WHERE company_id=$1',
        [companyId],
      );
      await dataSource.query(
        'DELETE FROM attendance_daily_summaries WHERE company_id=$1',
        [companyId],
      );
      await dataSource.query(
        'DELETE FROM employees WHERE company_id=$1 AND id<>$2',
        [companyId, employeeId],
      );
      await dataSource.query(
        'DELETE FROM company_user_permissions WHERE company_user_id=$1',
        [member.id],
      );
      await memberships.delete(member.id);
      await people.delete(reviewer.id);
      await employees.delete(other.id);
      await dataSource.getRepository(Company).delete(foreign.id);
    }
  });

  it('keeps submitted movement approval steps and isolates company policy changes', async () => {
    const http = request(app.getHttpServer() as App);
    const auth = 'Bearer ' + token;
    const root = '/api/employee-movements';
    const settings = root + '/settings';
    for (const name of [
      'employee_movements:manage-settings',
      'employee_movements:create',
      'employee_movements:submit',
      'employee_movements:read',
      'data_scope:company',
    ]) {
      await grantPermission(
        (await dataSource.getRepository(Permission).findOneByOrFail({ name }))
          .id,
      );
    }
    const companies = dataSource.getRepository(Company);
    const other = await companies.save(
      companies.create({
        name: 'Other movement policy tenant',
        slug: 'other-movement-policy-' + companyId,
        status: 'active',
      }),
    );
    try {
      await dataSource.query(
        'INSERT INTO employee_movement_policies VALUES ($1, false, true, 19)',
        [other.id],
      );
      const policy = {
        require_management_approval: true,
        allow_backdating: false,
        max_backdate_days: 2,
      };
      await http
        .put(settings)
        .set('Authorization', auth)
        .send(policy)
        .expect(200);
      await dataSource
        .getRepository(Employee)
        .update(employeeId, { employment_status: EmploymentStatusEnum.ACTIVE });
      const [grade] = await dataSource.query<Array<{ id: number }>>(
        "INSERT INTO employee_grades (company_id, code, name) VALUES ($1, 'M2', 'Senior') RETURNING id",
        [companyId],
      );
      const movement = async (offset: number) => {
        const effective = new Date(Date.now() + offset * 86400000)
          .toISOString()
          .slice(0, 10);
        const draft = await http
          .post(root)
          .set('Authorization', auth)
          .send({
            employee_id: employeeId,
            title: 'Promotion',
            reason: 'Role change',
            movement_type: 'PROMOTION',
            new_grade_id: grade.id,
            effective_date: effective,
          })
          .expect(201);
        expect(draft.body.employeeAcknowledgementRequired).toBe(false);
        const result = await http
          .post(root + '/' + String(draft.body.id) + '/submit')
          .set('Authorization', auth)
          .expect(201);
        return result.body as {
          id: number;
          metadata: { approval_steps: string[] };
        };
      };
      const first = await movement(1);
      expect(first.metadata.approval_steps).toEqual(['PRIMARY', 'MANAGEMENT']);
      await http
        .put(settings)
        .set('Authorization', auth)
        .send({ ...policy, require_management_approval: false })
        .expect(200);
      expect((await movement(2)).metadata.approval_steps).toEqual(['PRIMARY']);
      const submitted = await http
        .get(root + '/' + first.id)
        .set('Authorization', auth)
        .expect(200);
      expect(submitted.body.metadata.approval_steps).toEqual([
        'PRIMARY',
        'MANAGEMENT',
      ]);
      expect(
        await dataSource.query(
          'SELECT require_management_approval,allow_backdating,max_backdate_days FROM employee_movement_policies WHERE company_id=$1',
          [other.id],
        ),
      ).toEqual([
        {
          require_management_approval: false,
          allow_backdating: true,
          max_backdate_days: 19,
        },
      ]);
    } finally {
      await dataSource.query(
        'DELETE FROM employee_movements WHERE company_id=$1',
        [companyId],
      );
      await dataSource.query(
        'DELETE FROM employee_grades WHERE company_id=$1',
        [companyId],
      );
      await companies.delete(other.id);
    }
  });

  it('verifies movement policy, application, payroll, employee acknowledgement and reporting scope', async () => {
    const http = request(app.getHttpServer() as App);
    const auth = 'Bearer ' + token;
    const root = '/api/employee-movements';
    const settings = root + '/settings';
    const permission = (name: string) =>
      dataSource.getRepository(Permission).findOneByOrFail({ name });
    const grant = async (name: string) =>
      grantPermission((await permission(name)).id);
    await http.get(settings).set('Authorization', auth).expect(403);
    await grant('employee_movements:manage-settings');
    const defaults = (
      await http.get(settings).set('Authorization', auth).expect(200)
    ).body;
    expect(defaults.source).toBe('installation');
    const policy = {
      require_management_approval: true,
      allow_backdating: true,
      max_backdate_days: 10,
    };
    await http
      .put(settings)
      .set('Authorization', auth)
      .send({ ...policy, max_backdate_days: -1 })
      .expect(400);
    await http
      .put(settings)
      .set('Authorization', auth)
      .send(policy)
      .expect(200)
      .expect({ ...policy, source: 'company' });
    for (const name of [
      'employee_movements:create',
      'employee_movements:read',
      'employee_movements:submit',
      'employee_movements:apply',
      'employee_movements:approve',
      'employees:read',
      'data_scope:company',
      'manager_team:read',
    ])
      await grant(name);
    const day = (offset: number) =>
      new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const employees = dataSource.getRepository(Employee);
    await employees.update(employeeId, {
      employment_status: EmploymentStatusEnum.ACTIVE,
      hire_date: day(-100),
    });
    const versions = dataSource.getRepository(EmployeeCompensationVersion);
    const original = await versions.save(
      versions.create({
        companyId,
        employeeId,
        baseSalary: '1000.00',
        currency: 'TZS',
        effectiveFrom: day(-90),
        status: EmployeeCompensationVersionStatusEnum.ACTIVE,
        payrollSyncStatus: 'READY',
      }),
    );
    const salary = {
      employee_id: employeeId,
      title: 'Pay revision',
      reason: 'Annual review',
      movement_type: 'SALARY_REVISION',
      effective_date: day(-1),
      salary_revision: {
        base_salary: '1400.00',
        currency: 'TZS',
        justification: 'Salary review',
      },
      employee_acknowledgement_required: true,
    };
    await http.post(root).set('Authorization', auth).send(salary).expect(403);
    await grant('employee_movements:backdate');
    await http
      .post(root)
      .set('Authorization', auth)
      .send({ ...salary, effective_date: day(-11) })
      .expect(400);
    const created = await http
      .post(root)
      .set('Authorization', auth)
      .send(salary)
      .expect(201);
    const id = Number(created.body.id);
    const path = root + '/' + id;
    const own = '/api/me/movements/' + id;
    await http
      .patch(path)
      .set('Authorization', auth)
      .send({ title: 'Annual revision' })
      .expect(200);
    expect(
      (await http.get(own).set('Authorization', auth).expect(200)).body
        .employee_acknowledgement_required,
    ).toBe(true);
    await http
      .post(own + '/acknowledge')
      .set('Authorization', auth)
      .expect(409);
    await http
      .post(path + '/apply')
      .set('Authorization', auth)
      .expect(409);
    expect((await http.get(path).set('Authorization', auth)).body.status).toBe(
      'DRAFT',
    );
    const submitted = await http
      .post(path + '/submit')
      .set('Authorization', auth)
      .expect(201);
    expect(submitted.body.metadata.approval_steps).toEqual([
      'PRIMARY',
      'FINANCE',
    ]);
    await http
      .post(path + '/approve')
      .set('Authorization', auth)
      .send({})
      .expect(403);

    const users = dataSource.getRepository(User);
    const checker = await users.save(
      users.create({
        user_no: 'CHK-' + companyId,
        email: 'checker.' + companyId + '@example.test',
        first_name: 'Independent',
        last_name: 'Reviewer',
        phone: '+2558' + String(companyId).padStart(8, '0'),
        user_type: 'COMPANY_USER',
        password: await hashPassword(password),
        status: 'active',
        is_email_verified: true,
        auth_token_version: 1,
      }),
    );
    const members = dataSource.getRepository(CompanyUser);
    const member = await members.save(
      members.create({
        user_id: checker.id,
        company_id: companyId,
        status: 'active',
        is_default: true,
      }),
    );
    try {
      for (const name of [
        'data_scope:company',
        'employee_movements:approve',
        'employee_movements:finance-approve',
      ])
        await dataSource.getRepository(CompanyUserPermission).save({
          company_user_id: member.id,
          permission_id: (await permission(name)).id,
        });
      const login = await http
        .post('/api/auth/login')
        .send({ email: checker.email, password })
        .expect(201);
      const checkerAuth = 'Bearer ' + String(login.body.access_token);
      await http.get(settings).set('Authorization', checkerAuth).expect(403);
      await http
        .post(path + '/approve')
        .set('Authorization', checkerAuth)
        .send({})
        .expect(201);
      const approved = await http
        .post(path + '/approve')
        .set('Authorization', checkerAuth)
        .send({})
        .expect(201);
      expect(approved.body.status).toBe('APPROVED');
      for (let attempt = 0; attempt < 2; attempt++)
        await http
          .post(path + '/apply')
          .set('Authorization', auth)
          .expect(201);
      const history = await http
        .get('/api/employees/' + employeeId + '/employment-history')
        .set('Authorization', auth)
        .expect(200);
      const events = (
        history.body as Array<{ source_entity_id: number; event_type: string }>
      ).filter(
        (row) =>
          row.source_entity_id === id && row.event_type === 'MOVEMENT_APPLIED',
      );
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        effective_date: day(-1),
        old_values: null,
        new_values: null,
        created_by_company_user_id: companyUserId,
      });
      expect(JSON.stringify(events)).not.toContain('1400');
      const acknowledged = await Promise.all(
        [1, 2].map(() =>
          http
            .post(own + '/acknowledge')
            .set('Authorization', auth)
            .expect(201),
        ),
      );
      expect(acknowledged[0].body.employee_acknowledged_at).toEqual(
        acknowledged[1].body.employee_acknowledged_at,
      );
      expect(acknowledged[0].body.changes).toEqual([]);
      const version = await versions.findOneByOrFail({ movementId: id });
      expect(version).toMatchObject({
        payrollSyncStatus: 'READY',
        baseSalary: '1400.00',
        effectiveFrom: day(-1),
      });
      expect(await versions.findOneByOrFail({ id: original.id })).toMatchObject(
        { effectiveTo: day(-2) },
      );
      await dataSource.getRepository(EmployeePayrollProfile).save({
        companyId,
        employeeId,
        payrollNumber: 'MOV-' + employeeId,
        effectiveFrom: day(-90),
      });
      // The isolated company needs an approved test rule to run the real payroll calculator.
      const scheme = await dataSource.getRepository(StatutoryScheme).save({
        companyId,
        code: 'TEST_PAYE',
        name: 'Test payroll rule',
        schemeType: StatutorySchemeTypeEnum.PAYE,
        status: 'ACTIVE',
      });
      await dataSource.getRepository(StatutoryRuleVersion).save({
        companyId,
        schemeId: scheme.id,
        versionNumber: 1,
        effectiveFrom: day(-100),
        status: 'APPROVED',
        calculationMethod: PayrollCalculationMethodEnum.PERCENTAGE_OF_BASE,
        employeeRate: '1.00',
      });
      const calendar = await dataSource.getRepository(PayrollCalendar).save({
        companyId,
        code: 'MOV',
        name: 'Movement integration calendar',
      });
      const payroll = app.get(EmployeePayrollCalculationService);
      for (const [date, expected] of [
        [day(-35), original],
        [day(1), version],
      ] as const) {
        const period = await dataSource.getRepository(PayrollPeriod).save({
          payrollCalendarId: calendar.id,
          periodCode: date.slice(0, 7),
          periodYear: Number(date.slice(0, 4)),
          periodMonth: Number(date.slice(5, 7)),
          cutoffDate: date,
          companyId,
          startDate: date,
          endDate: date,
          paymentDate: date,
        });
        const run = await dataSource.getRepository(PayrollRun).save({
          runNo: 'MOV-' + period.id,
          createdByCompanyUserId: companyUserId,
          payrollPeriodId: period.id,
          companyId,
          runType: PayrollRunTypeEnum.REGULAR,
          payrollGroupId: null,
        });
        const eligibility = await payroll.buildEligibility(
          companyId,
          period,
          run,
        );
        expect(eligibility.rows).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              employee_id: employeeId,
              status: 'ELIGIBLE',
            }),
          ]),
        );
        const result = await payroll.calculateRun(companyId, period, run);
        expect(result[0].result.compensationSnapshot).toMatchObject({
          id: expected.id,
          movementId: expected.movementId ?? null,
          baseSalary: expected.baseSalary,
        });
      }

      const report = async (name: string, manager: number | null) =>
        employees.save(
          employees.create({
            company_id: companyId,
            employee_no: name,
            first_name: name,
            last_name: 'Team',
            gender: 'female',
            reports_to: manager,
            employment_status: EmploymentStatusEnum.ACTIVE,
          }),
        );
      const direct = await report('Direct', employeeId),
        indirect = await report('Indirect', direct.id),
        peer = await report('Peer', null);
      const ids: number[] = [];
      for (const employee of [direct, indirect, peer]) {
        const item = await http
          .post(root)
          .set('Authorization', auth)
          .send({
            ...salary,
            employee_id: employee.id,
            employee_acknowledgement_required: false,
          })
          .expect(201);
        ids.push(Number(item.body.id));
      }
      expect(
        (
          await http
            .get(root + '/team')
            .set('Authorization', auth)
            .expect(200)
        ).body
          .map((row: { id: number }) => row.id)
          .sort(),
      ).toEqual(ids.slice(0, 2).sort());
      await revokePermission((await permission('employee_movements:read')).id);
      const team = (await http.get(root).set('Authorization', auth).expect(200))
        .body as Array<{ id: number }>;
      expect(team.map((row) => row.id).sort()).toEqual(ids.slice(0, 2).sort());
      expect(team[0]).not.toHaveProperty('currentSnapshot');
      await http
        .get(root + '/' + ids[2])
        .set('Authorization', auth)
        .expect(403);
      await http
        .get(root + '/' + ids[2] + '/operations')
        .set('Authorization', auth)
        .expect(403);
      await http
        .post(root + '/' + ids[2] + '/approve')
        .set('Authorization', auth)
        .send({})
        .expect(403);
      await http
        .post('/api/me/movements/' + ids[0] + '/acknowledge')
        .set('Authorization', auth)
        .expect(404);
      await http
        .delete(settings)
        .set('Authorization', auth)
        .expect(200)
        .expect(defaults);
    } finally {
      await dataSource.getRepository(PayrollRun).delete({ companyId });
      await dataSource.getRepository(PayrollPeriod).delete({ companyId });
      await dataSource.getRepository(PayrollCalendar).delete({ companyId });

      await dataSource
        .getRepository(EmployeePayrollProfile)
        .delete({ companyId });
      await versions.delete({ companyId });
      await dataSource.query(
        'DELETE FROM employee_employment_events WHERE company_id=$1',
        [companyId],
      );
      await dataSource.query(
        'DELETE FROM employee_movements WHERE company_id=$1',
        [companyId],
      );
      await dataSource.query(
        'DELETE FROM employees WHERE company_id=$1 AND id<>$2',
        [companyId, employeeId],
      );
      await dataSource.query(
        'DELETE FROM company_user_permissions WHERE company_user_id=$1',
        [member.id],
      );
      await members.delete(member.id);
      await users.delete(checker.id);
    }
  });

  it('saves scoped probation rules, rates the assigned case and sends Further review to HR', async () => {
    const http = request(app.getHttpServer() as App);
    const auth = `Bearer ${token}`;
    await http
      .get('/api/probation/policy-options')
      .set('Authorization', auth)
      .expect(403);
    await http
      .get('/api/probation/letter-templates')
      .set('Authorization', auth)
      .expect(403);
    const names = [
      'data_scope:company',
      'probation_policies:read',
      'probation_policies:create',
      'probation_policies:update',
      'probation_cases:create',
      'probation_cases:update',
      'probation_cases:read',
      'probation_reviews:manager-review',
      'probation_letters:generate',
    ];
    for (const name of names) {
      const permission = await dataSource
        .getRepository(Permission)
        .findOneByOrFail({ name });
      await grantPermission(permission.id);
    }
    const options = await http
      .get('/api/probation/policy-options')
      .set('Authorization', auth)
      .expect(200);
    expect(options.body.targets).toMatchObject({
      branch_id: [],
      department_id: [],
      position_id: [],
      grade_id: [],
    });
    expect(options.body.defaults).toMatchObject({
      reminder_days: expect.any(Array),
      maximum_total_days: expect.any(Number),
      minimum_confirmation_score: expect.any(Number),
      self_assessment_required: expect.any(Boolean),
      objectives_required: expect.any(Boolean),
      manager_review_required: expect.any(Boolean),
      confirmation_letter_required: expect.any(Boolean),
    });
    const rules = {
      code: 'FIELD',
      name: 'Field review',
      effective_from: '2020-01-01',
      effective_to: '2030-01-01',
      probation_period_days: 90,
      maximum_extensions: 0,
      default_extension_days: 10,
      maximum_extension_days: 20,
      priority: 3,
      is_default: true,
      objectives_required: false,
      self_assessment_required: false,
      manager_review_required: true,
      confirmation_letter_required: false,
      criteria: [
        { code: 'QUALITY', name: 'Quality', weight: 100, maximum_rating: 4 },
      ],
    };
    await http
      .post('/api/probation/policies')
      .set('Authorization', auth)
      .send({ ...rules, branch_id: 2147483647 })
      .expect(400);
    const policy = await http
      .post('/api/probation/policies')
      .set('Authorization', auth)
      .send(rules)
      .expect(201);
    expect(policy.body).toMatchObject({
      maximumExtensions: 0,
      isDefault: true,
      priority: 3,
      objectivesRequired: false,
      confirmationLetterRequired: false,
    });
    await http
      .patch(`/api/probation/policies/${policy.body.id}`)
      .set('Authorization', auth)
      .send({ effective_to: null })
      .expect(200);
    const person = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: companyId,
        employee_no: `R-${companyId}`,
        first_name: 'Review',
        last_name: 'Subject',
        gender: 'female',
        reports_to: employeeId,
      }),
    );
    const probation = await http
      .post('/api/probation/cases')
      .set('Authorization', auth)
      .send({
        employee_id: person.id,
        start_date: '2020-03-01',
        policy_id: policy.body.id,
      })
      .expect(201);
    const id = Number(probation.body.id);
    const replacement = await http
      .post('/api/probation/policies')
      .set('Authorization', auth)
      .send({
        ...rules,
        code: 'TEAM',
        name: 'Team review',
        maximum_extensions: 2,
        criteria: [
          {
            code: 'WORK',
            name: 'Work quality',
            weight: 100,
            maximum_rating: 4,
          },
        ],
      })
      .expect(201);
    await http
      .patch(`/api/probation/cases/${id}`)
      .set('Authorization', auth)
      .send({ policy_id: replacement.body.id })
      .expect(200);
    // Later changes to this reusable policy must leave the case's selected rules intact.
    await http
      .patch(`/api/probation/policies/${replacement.body.id}`)
      .set('Authorization', auth)
      .send({
        default_extension_days: 15,
        criteria: [
          { code: 'LEAD', name: 'Leadership', weight: 100, maximum_rating: 5 },
        ],
      })
      .expect(200);
    await app.get(ProbationReminderService).run();
    const detail = await http
      .get(`/api/probation/cases/${id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(detail.body.status).toBe('MANAGER_REVIEW_PENDING');
    expect(detail.body.managerReviewCriteria).toEqual([
      expect.objectContaining({
        criterionCode: 'WORK',
        criterionName: 'Work quality',
      }),
    ]);
    // With only a reviewer grant, case detail is limited to the assigned reviewer.
    const readPermission = await dataSource
      .getRepository(Permission)
      .findOneByOrFail({ name: 'probation_cases:read' });
    await revokePermission(readPermission.id);
    await http
      .get(`/api/probation/cases/${id}`)
      .set('Authorization', auth)
      .expect(200);
    await dataSource.query(
      'UPDATE probation_cases SET manager_company_user_id = NULL WHERE id=$1',
      [id],
    );
    await http
      .get(`/api/probation/cases/${id}`)
      .set('Authorization', auth)
      .expect(403);
    await http
      .get('/api/probation/cases/my-team')
      .set('Authorization', auth)
      .expect(200, []);
    await dataSource.query(
      'UPDATE probation_cases SET manager_company_user_id = $1 WHERE id=$2',
      [companyUserId, id],
    );
    const review = {
      recommendation: 'FURTHER_REVIEW',
      comments: 'HR to review the evidence.',
      ratings: [],
    };
    const path = `/api/probation/cases/${id}/manager-review`;
    await http.post(path).set('Authorization', auth).send(review).expect(400);
    await http
      .post(path)
      .set('Authorization', auth)
      .send({
        ...review,
        ratings: [
          {
            criterion_code: 'WORK',
            rating: 3,
            comment: 'Completed the assignment.',
          },
        ],
      })
      .expect(201);
    const updated = await http
      .get(`/api/probation/cases/${id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(updated.body).toMatchObject({
      status: 'HR_REVIEW_PENDING',
      finalDecision: null,
      reviewCycles: [
        expect.objectContaining({
          managerRecommendation: 'FURTHER_REVIEW',
          managerComments: review.comments,
          managerScore: '75.00',
        }),
      ],
      managerReviewCriteria: [
        expect.objectContaining({
          managerRating: '3.00',
          managerComment: 'Completed the assignment.',
        }),
      ],
    });
    const hrPath = `/api/probation/cases/${id}/hr-decision`;
    const extend = {
      decision: 'EXTENDED',
      comments: 'Additional supervised work.',
    };
    await http.post(hrPath).set('Authorization', auth).send(extend).expect(403);
    await grantPermission(
      (
        await dataSource
          .getRepository(Permission)
          .findOneByOrFail({ name: 'probation_reviews:hr-decision' })
      ).id,
    );
    const due = String(updated.body.currentDueDate);
    const daysAfterDue = (days: number) =>
      new Date(Date.parse(due + 'T00:00:00Z') + days * 86400000)
        .toISOString()
        .slice(0, 10);
    for (const invalid of [
      { extension_days: 21 },
      { extension_end_date: daysAfterDue(21) },
      { extension_end_date: due },
      { extension_days: 4, extension_end_date: daysAfterDue(5) },
    ]) {
      await http
        .post(hrPath)
        .set('Authorization', auth)
        .send({ ...extend, ...invalid })
        .expect(400);
    }
    await http.post(hrPath).set('Authorization', auth).send(extend).expect(201);
    const next = await http
      .get(`/api/probation/cases/${id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(next.body).toMatchObject({
      status: 'EXTENDED',
      currentCycleNumber: 2,
      extensionCount: 1,
      currentDueDate: daysAfterDue(10),
      managerReviewCriteria: [
        expect.objectContaining({
          criterionCode: 'WORK',
          maximumRating: '4.00',
          managerRating: null,
          managerComment: null,
        }),
      ],
    });
    expect(
      await dataSource.query(
        'SELECT extension_days FROM probation_extensions WHERE probation_case_id=$1',
        [id],
      ),
    ).toEqual([{ extension_days: 10 }]);
    await app.get(ProbationReminderService).run();
    await http
      .post(path)
      .set('Authorization', auth)
      .send({
        ...review,
        recommendation: 'EXTEND',
        recommended_extension_days: 21,
        ratings: [{ criterion_code: 'WORK', rating: 0 }],
      })
      .expect(400);

    await http
      .post(path)
      .set('Authorization', auth)
      .send({
        ...review,
        recommendation: 'EXTEND',
        recommended_extension_days: 8,
        ratings: [{ criterion_code: 'WORK', rating: 0 }],
      })
      .expect(201);
    const proposed = await http
      .get(`/api/probation/cases/${id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(proposed.body).toMatchObject({
      status: 'HR_REVIEW_PENDING',
      extensionCount: 1,
      currentDueDate: daysAfterDue(10),
    });
    expect(proposed.body.reviewCycles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cycleNumber: 2,
          managerRecommendation: 'EXTEND',
          recommendedExtensionDays: 8,
        }),
        expect.objectContaining({
          cycleNumber: 1,
          managerRecommendation: 'FURTHER_REVIEW',
          recommendedExtensionDays: null,
        }),
      ]),
    );
    await http
      .post(hrPath)
      .set('Authorization', auth)
      .send({ ...extend, extension_end_date: daysAfterDue(15) })
      .expect(201);
    expect(
      await dataSource.query(
        'SELECT extension_days FROM probation_extensions WHERE probation_case_id=$1 ORDER BY extension_number',
        [id],
      ),
    ).toEqual([{ extension_days: 10 }, { extension_days: 5 }]);

    const template = {
      letter_type: 'CONFIRMATION',
      letterhead: 'People team',
      body: 'Your appointment is confirmed.',
      signatory_name: 'Test reviewer',
      signatory_title: 'People manager',
    };
    const templatePath = '/api/probation/letter-templates';
    await http
      .post(templatePath)
      .set('Authorization', auth)
      .send({ ...template, body: '   ' })
      .expect(400);
    const saveTemplate = (letter_type: string, body: string) =>
      http
        .post(templatePath)
        .set('Authorization', auth)
        .send({ ...template, letter_type, body })
        .expect(201);
    const [first, second] = await Promise.all([
      saveTemplate('CONFIRMATION', 'First draft'),
      saveTemplate('CONFIRMATION', 'Second draft'),
    ]);
    expect(first.body.id).toEqual(second.body.id);
    await saveTemplate('CONFIRMATION', template.body);
    await saveTemplate('EXTENSION', 'Your probation is extended.');
    await saveTemplate('NOT_CONFIRMED', 'The review is complete.');
    const saved = await http
      .get('/api/probation/letter-templates')
      .set('Authorization', auth)
      .expect(200);
    expect(saved.body).toEqual([
      expect.objectContaining({
        letterType: 'CONFIRMATION',
        body: template.body,
      }),
      expect.objectContaining({
        letterType: 'EXTENSION',
        body: 'Your probation is extended.',
      }),
      expect.objectContaining({
        letterType: 'NOT_CONFIRMED',
        body: 'The review is complete.',
      }),
    ]);
  });

  it('keeps branch calendar actions behind their corresponding attendance grants', async () => {
    const api = request(app.getHttpServer() as App);
    const auth = { Authorization: 'Bearer ' + token };
    const path = '/api/leave/holidays';
    const [branch] = await dataSource.query<Array<{ id: number }>>(
      'INSERT INTO branches(company_id,name) VALUES ($1,$2) RETURNING id',
      [companyId, 'Calendar branch'],
    );
    const add = async (name: string) => {
      const grant = await dataSource
        .getRepository(Permission)
        .findOneByOrFail({ name });
      await grantPermission(grant.id);
      return grant.id;
    };
    const body = {
      name: 'Local holiday',
      holiday_date: '2031-09-02',
      branch_id: branch.id,
    };
    await api.get(path).set(auth).expect(403);
    await add('attendance_holidays:read');
    await api.get(path).set(auth).expect(200);
    for (const action of ['create', 'update', 'delete'])
      await add('holidays:' + action);
    await api
      .get(path + '/branches')
      .set(auth)
      .expect(403);
    await api.post(path).set(auth).send(body).expect(403);
    const create = await add('attendance_holidays:create');
    const options = await api
      .get(path + '/branches')
      .set(auth)
      .expect(200);
    expect(options.body).toContainEqual({
      id: branch.id,
      name: 'Calendar branch',
    });
    const local = await api.post(path).set(auth).send(body).expect(201);
    await revokePermission(create);
    const row = path + '/' + local.body.id;
    const scope = { branch_id: branch.id };
    await api
      .patch(row)
      .set(auth)
      .send({ name: 'Denied', ...scope })
      .expect(403);
    await api.delete(row).set(auth).query(scope).expect(403);
    await api.delete(row).set(auth).expect(404);
    const update = await add('attendance_holidays:update');
    await api
      .patch(row)
      .set(auth)
      .send({ name: 'Renamed', ...scope })
      .expect(200);
    await revokePermission(update);
    await api
      .patch(row)
      .set(auth)
      .send({ name: 'Revoked', ...scope })
      .expect(403);
    await add('attendance_holidays:delete');
    await api.delete(row).set(auth).query(scope).expect(200);
  });

  it('scopes both business trip reads and reassignment to accessible employees', async () => {
    const api = request(app.getHttpServer() as App);
    const auth = { Authorization: 'Bearer ' + token };
    const path = '/api/attendance/business-trips';
    for (const name of [
      'attendance_business_trips:read',
      'attendance_business_trips:update',
      'data_scope:self',
    ]) {
      const permission = await dataSource
        .getRepository(Permission)
        .findOneByOrFail({ name });
      await grantPermission(permission.id);
    }
    const repo = dataSource.getRepository(Employee);
    const ownEmployee = await repo.findOneByOrFail({ id: employeeId });
    const colleague = await repo.save(
      repo.create({
        company_id: companyId,
        employee_no: 'TRIP-OTHER',
        first_name: 'Example',
        last_name: 'Colleague',
        hire_date: ownEmployee.hire_date,
        gender: ownEmployee.gender,
      }),
    );
    const trip = async (id: number) => {
      const [value] = await dataSource.query<Array<{ id: number }>>(
        "INSERT INTO attendance_business_trips(company_id,employee_id,start_date,end_date,status) VALUES ($1,$2,'2031-04-07','2031-04-07','draft') RETURNING id",
        [companyId, id],
      );
      return value.id;
    };
    const own = await trip(employeeId);
    const other = await trip(colleague.id);
    const listed = await api.get(path).set(auth).expect(200);
    expect(listed.body.data).toEqual([expect.objectContaining({ id: own })]);
    expect(
      (
        await api
          .get(path)
          .set(auth)
          .query({ employee_id: colleague.id })
          .expect(200)
      ).body.data,
    ).toEqual([]);
    await api
      .get(path + '/' + own)
      .set(auth)
      .expect(200);
    await api
      .get(path + '/' + other)
      .set(auth)
      .expect(403);
    await api
      .patch(path + '/' + other)
      .set(auth)
      .send({ employee_id: employeeId })
      .expect(403);
    const companyGrant = await dataSource
      .getRepository(Permission)
      .findOneByOrFail({ name: 'data_scope:company' });
    await grantPermission(companyGrant.id);
    expect((await api.get(path).set(auth).expect(200)).body.data).toHaveLength(
      2,
    );
    await api
      .get(path + '/' + other)
      .set(auth)
      .expect(200);
  });

  it('uses the team attendance grant on both manager and self-service routes', async () => {
    const http = request(app.getHttpServer() as App);
    const routes = ['/api/manager/team/attendance', '/api/me/team/attendance'];
    const grant = await dataSource
      .getRepository(Permission)
      .findOneByOrFail({ name: 'team_attendance:read' });
    const managerRead = await dataSource
      .getRepository(Permission)
      .findOneByOrFail({ name: 'manager_team:read' });
    await grantPermission(managerRead.id);
    for (const path of routes)
      await http
        .get(path)
        .set('Authorization', 'Bearer ' + token)
        .expect(403);
    await grantPermission(grant.id);
    for (const path of routes)
      await http
        .get(path)
        .set('Authorization', 'Bearer ' + token)
        .expect(200);
    await revokePermission(grant.id);
    for (const path of routes)
      await http
        .get(path)
        .set('Authorization', 'Bearer ' + token)
        .expect(403);
  });

  it('denies access to a protected resource when the required permission is missing', async () => {
    await request(app.getHttpServer() as App)
      .get(`/api/employees/${employeeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows access on the very next request after the permission is granted, with no new login', async () => {
    await request(app.getHttpServer() as App)
      .get(`/api/employees/${employeeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    await grantPermission(employeesReadPermissionId);
    await grantPermission(dataScopeCompanyPermissionId);

    await request(app.getHttpServer() as App)
      .get(`/api/employees/${employeeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('denies access again immediately after the permission is revoked, with the same still-valid token', async () => {
    await grantPermission(employeesReadPermissionId);
    await grantPermission(dataScopeCompanyPermissionId);

    await request(app.getHttpServer() as App)
      .get(`/api/employees/${employeeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await revokePermission(employeesReadPermissionId);

    await request(app.getHttpServer() as App)
      .get(`/api/employees/${employeeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('resolves each seeded company role against its own grants on the same session', async () => {
    const catalogue = new Map(
      (await dataSource.getRepository(Permission).find()).map((permission) => [
        permission.name,
        permission,
      ]),
    );
    const http = request(app.getHttpServer() as App);
    for (const seed of COMPANY_ROLE_SEEDS) {
      const permissionNames = [...new Set(seed.permissionNames)];
      const role = await dataSource.getRepository(Role).save({
        name: seed.name,
        display_name: seed.displayName,
        company_id: companyId,
        is_system_generated: true,
        permissions: permissionNames.map((name) => {
          const permission = catalogue.get(name);
          if (!permission) throw new Error(`Missing catalogue entry ${name}`);
          return permission;
        }),
      });
      await dataSource.query(
        'INSERT INTO company_user_roles(company_user_id,role_id) VALUES($1,$2)',
        [companyUserId, role.id],
      );
      const session = await http
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        new Set((session.body as { permissions: string[] }).permissions),
      ).toEqual(new Set(effectivePermissions(permissionNames)));
      await http
        .get('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(permissionNames.includes('users:read') ? 200 : 403);
      await dataSource.query(
        'DELETE FROM company_user_roles WHERE company_user_id=$1 AND role_id=$2',
        [companyUserId, role.id],
      );
    }
  }, 90000);

  it('protects platform System roles while allowing authorized company role edits', async () => {
    for (const name of [
      'roles:update',
      'roles:delete',
      'roles:assign-permission',
      'roles:revoke-permission',
    ]) {
      const permission = await dataSource
        .getRepository(Permission)
        .findOneByOrFail({ name });
      await grantPermission(permission.id);
    }
    const repo = dataSource.getRepository(Role);
    const role = await repo.save(
      repo.create({
        company_id: null,
        name: 'MATRIX_DEFAULT',
        display_name: 'Matrix default',
        is_system_generated: true,
      }),
    );
    const http = request(app.getHttpServer() as App);
    const headers = { Authorization: `Bearer ${token}` };
    await http
      .patch(`/api/roles/${role.id}`)
      .set(headers)
      .send({ display_name: 'Changed' })
      .expect(404);
    await http
      .post(`/api/roles/${role.id}/permissions`)
      .set(headers)
      .send({ permission_id: employeesReadPermissionId })
      .expect(404);
    await http
      .delete(`/api/roles/${role.id}/permissions/${employeesReadPermissionId}`)
      .set(headers)
      .expect(404);
    await http.delete(`/api/roles/${role.id}`).set(headers).expect(404);
    expect((await repo.findOneByOrFail({ id: role.id })).display_name).toBe(
      'Matrix default',
    );
    const companyRole = await repo.save(
      repo.create({
        company_id: companyId,
        name: 'MATRIX_COMPANY_DEFAULT',
        display_name: 'Company default',
        is_system_generated: true,
      }),
    );
    await http
      .patch(`/api/roles/${companyRole.id}`)
      .set(headers)
      .send({ display_name: 'Updated company default' })
      .expect(200);
    expect(
      (await repo.findOneByOrFail({ id: companyRole.id })).display_name,
    ).toBe('Updated company default');
  });

  it('requires the sync log grant for command and sync logs, including direct requests', async () => {
    const http = request(app.getHttpServer() as App);
    const permissions = dataSource.getRepository(Permission);
    await grantPermission(
      (await permissions.findOneByOrFail({ name: 'attendance_devices:read' }))
        .id,
    );
    await grantPermission(dataScopeCompanyPermissionId);
    const endpoints = ['device-command-logs', 'hikvision-sync-logs'];
    for (const path of endpoints)
      await http
        .get(`/api/access-control/${path}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    await grantPermission(
      (
        await permissions.findOneByOrFail({
          name: 'access_control_sync:execute',
        })
      ).id,
    );
    for (const path of endpoints)
      await http
        .get(`/api/access-control/${path}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
  });

  it('rejects an unauthenticated request before permissions are even evaluated', async () => {
    await request(app.getHttpServer() as App)
      .get(`/api/employees/${employeeId}`)
      .expect(401);
  });
});
