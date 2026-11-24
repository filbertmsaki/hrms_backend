process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
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
    expect(options.body.defaults.reminder_days).toEqual(expect.any(Array));
    const rules = {
      code: 'FIELD',
      name: 'Field review',
      effective_from: '2026-01-01',
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
        start_date: '2026-03-01',
        policy_id: policy.body.id,
      })
      .expect(201);
    const id = Number(probation.body.id);
    // Set the clock-driven due state on this case only.
    await dataSource.query(
      "UPDATE probation_cases SET status='MANAGER_REVIEW_PENDING' WHERE id=$1 AND company_id=$2",
      [id, companyId],
    );
    await dataSource.query(
      "UPDATE probation_review_cycles SET status='MANAGER_REVIEW_PENDING' WHERE probation_case_id=$1",
      [id],
    );
    const detail = await http
      .get(`/api/probation/cases/${id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(detail.body.managerReviewCriteria).toEqual([
      expect.objectContaining({
        criterionCode: 'QUALITY',
        criterionName: 'Quality',
      }),
    ]);
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
            criterion_code: 'QUALITY',
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
    });
    const template = {
      letter_type: 'CONFIRMATION',
      letterhead: 'People team',
      body: 'Your appointment is confirmed.',
      signatory_name: 'Test reviewer',
      signatory_title: 'People manager',
    };
    await http
      .post('/api/probation/letter-templates')
      .set('Authorization', auth)
      .send(template)
      .expect(201);
    const saved = await http
      .get('/api/probation/letter-templates')
      .set('Authorization', auth)
      .expect(200);
    expect(saved.body).toEqual([
      expect.objectContaining({
        letterType: 'CONFIRMATION',
        body: template.body,
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
