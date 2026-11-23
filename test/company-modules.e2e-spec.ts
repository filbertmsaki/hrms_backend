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
import { randomInt } from 'node:crypto';
import { generate } from 'otplib';
import { hashPassword } from '../src/common/utils/hash.util';
import { TwoFaService } from '../src/modules/auth/2fa/2fa.service';
import { Company } from '../src/modules/companies/entities/company.entity';
import { Role } from '../src/modules/roles/entities/role.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { createE2eApp } from './helpers/create-e2e-app';
import { initializeCompanyBankDirectory } from '../src/database/migration-helpers/company-bank-directory-1797900205000';

describe('Company role and permission modules (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const createdCompanyIds: number[] = [];
  const createdUserIds: number[] = [];
  let loginIpCounter = 1;

  function nextLoginIp(): string {
    return `10.0.0.${loginIpCounter++}`;
  }

  beforeAll(async () => {
    app = await createE2eApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    for (const companyId of [...createdCompanyIds].reverse()) {
      await dataSource.query('DELETE FROM companies WHERE id = $1', [
        companyId,
      ]);
    }
    createdCompanyIds.length = 0;

    for (const userId of [...createdUserIds].reverse()) {
      await dataSource.query('DELETE FROM auth_sessions WHERE user_id = $1', [
        userId,
      ]);
      await dataSource.query('DELETE FROM role_user WHERE "usersId" = $1', [
        userId,
      ]);
      await dataSource.query(
        'DELETE FROM permission_user WHERE "usersId" = $1',
        [userId],
      );
      await dataSource.query(
        'DELETE FROM company_user_permissions WHERE company_user_id IN (SELECT id FROM company_users WHERE user_id = $1)',
        [userId],
      );
      await dataSource.query(
        'DELETE FROM company_user_roles WHERE company_user_id IN (SELECT id FROM company_users WHERE user_id = $1)',
        [userId],
      );
      await dataSource.query(
        'DELETE FROM employees WHERE company_user_id IN (SELECT id FROM company_users WHERE user_id = $1)',
        [userId],
      );
      await dataSource.query('DELETE FROM company_users WHERE user_id = $1', [
        userId,
      ]);
      await dataSource.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    createdUserIds.length = 0;
  });

  function nextSuffix() {
    return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }

  async function createPlatformOwner(roleName = 'SUPER_ADMIN') {
    const suffix = nextSuffix();
    const password = 'PlatformOwner!2026';
    const superAdminRole = await dataSource
      .getRepository(Role)
      .createQueryBuilder('role')
      .where('role.name = :name', { name: roleName })
      .andWhere('role.company_id IS NULL')
      .getOneOrFail();

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `OWN-${suffix}`.slice(0, 20),
        first_name: 'Platform',
        last_name: 'Owner',
        phone: `+2558${suffix}`.slice(0, 20),
        email: `platform.owner.${suffix}@example.com`,
        password: await hashPassword(password),
        status: 'active',
        user_type: 'OWNER',
        is_email_verified: true,
        roles: [superAdminRole],
      }),
    );

    createdUserIds.push(user.id);

    const loginResponse = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .set('X-Forwarded-For', nextLoginIp())
      .send({
        email: user.email,
        password,
      })
      .expect(201);

    return {
      token: loginResponse.body.access_token as string,
    };
  }

  async function createCompanyViaApi(input?: {
    modules?: { roles?: boolean; permissions?: boolean };
    metadata?: Record<string, unknown>;
  }) {
    const suffix = nextSuffix();
    const platform = await createPlatformOwner();
    const adminPassword = 'CompanyAdmin!2026';

    const response = await request(app.getHttpServer() as App)
      .post('/api/companies')
      .set('Authorization', `Bearer ${platform.token}`)
      .send({
        company_name: `Alliance Uganda ${suffix}`,
        company_slug: `alliance-uganda-${suffix}`,
        admin_first_name: 'Jane',
        admin_last_name: 'Doe',
        admin_email: `company.admin.${suffix}@example.com`,
        admin_phone: `+2567${randomInt(10000000, 100000000)}`,
        admin_password: adminPassword,
        metadata: {
          ...(input?.metadata ?? {}),
          ...(input?.modules ? { modules: input.modules } : {}),
        },
      })
      .expect(201);

    const companyId = response.body.data.company.id as number;
    const administratorId = response.body.data.administrator.id as number;

    createdCompanyIds.push(companyId);
    createdUserIds.push(administratorId);

    const twoFaService = app.get(TwoFaService);
    const setup = await twoFaService.generate2FASetup(administratorId);
    await twoFaService.verifyAndActivate2FA(
      administratorId,
      await generate({ secret: setup.secret }),
    );

    return {
      platformToken: platform.token,
      adminPassword,
      adminEmail: response.body.data.administrator.email as string,
      twoFactorSecret: setup.secret,
      companyId,
      responseBody: response.body,
    };
  }

  async function loginCompanyAdmin(
    email: string,
    password: string,
    twoFactorSecret: string,
  ) {
    const loginResponse = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .set('X-Forwarded-For', nextLoginIp())
      .send({ email, password })
      .expect(201);

    expect(loginResponse.body.requires2FA).toBe(true);
    expect(loginResponse.body.tempToken).toEqual(expect.any(String));

    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/2fa/complete-login')
      .set('X-Forwarded-For', nextLoginIp())
      .send({
        tempToken: loginResponse.body.tempToken,
        code: await generate({ secret: twoFactorSecret }),
      })
      .expect(201);

    expect(response.body.access_token).toEqual(expect.any(String));
    return response.body.access_token as string;
  }

  async function companyFixture() {
    const fixture = await createCompanyViaApi();
    const token = await loginCompanyAdmin(
      fixture.adminEmail,
      fixture.adminPassword,
      fixture.twoFactorSecret,
    );
    return { ...fixture, token };
  }

  async function createHistoricalBankAccount(companyId: number) {
    const [employee] = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO employees (company_id, employee_no, first_name, last_name, gender, version, hire_date, employment_status)
       VALUES ($1,'HIST','Test','Employee','male',1,'2020-01-01','active') RETURNING id`,
      [companyId],
    );
    const [account] = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO employee_bank_accounts (employee_id, bank_name, account_number)
       VALUES ($1,'Example Bank','00000000') RETURNING id`,
      [employee.id],
    );
    return account.id;
  }

  it('initializes existing bank choices once, preserving overrides and later deletions', async () => {
    const tenant = await companyFixture();
    const api = request(app.getHttpServer() as App);
    const path = '/api/employees/bank-directory';
    const admin = `Bearer ${tenant.token}`;
    const list = async () =>
      (await api.get(path).set('Authorization', admin).expect(200))
        .body as Array<{ id: number; name: string; logo_url: string | null }>;
    const initial = await list();
    expect(initial).toHaveLength(34);
    const bank = initial.find((row) => row.name === 'NMB Bank Plc')!;
    expect(bank.logo_url).toContain('nmbbank.co.tz');
    // Model an existing tenant with a custom entry before the backfill.
    await dataSource.query(
      "UPDATE companies SET metadata=(metadata::jsonb - 'bank_directory_initialized')::json WHERE id=$1",
      [tenant.companyId],
    );
    await dataSource.query(
      'DELETE FROM company_banks WHERE company_id=$1 AND id<>$2',
      [tenant.companyId, bank.id],
    );
    await api
      .patch(path + '/' + bank.id)
      .set('Authorization', admin)
      .send({
        name: 'NMB BANK PLC',
        logo_url: 'https://example.test/logo.png',
        is_active: false,
      })
      .expect(200);
    await initializeCompanyBankDirectory(dataSource.manager, tenant.companyId);
    const management = await api
      .get(path + '/management')
      .set('Authorization', admin)
      .expect(200);
    expect(management.body).toHaveLength(34);
    expect(management.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bank.id,
          name: 'NMB BANK PLC',
          logo_url: 'https://example.test/logo.png',
          is_active: false,
        }),
      ]),
    );
    await api
      .delete(path + '/' + bank.id)
      .set('Authorization', admin)
      .expect(200);
    await initializeCompanyBankDirectory(dataSource.manager, tenant.companyId);
    const remaining = await list();
    expect(remaining).toHaveLength(33);
    expect(remaining.map((row) => row.name.toLowerCase())).not.toContain(
      'nmb bank plc',
    );
  });

  it('manages a tenant bank directory while preserving account details and employee access boundaries', async () => {
    const api = request(app.getHttpServer() as App);
    const tenant = await companyFixture();
    const other = await companyFixture();
    const admin = `Bearer ${tenant.token}`;
    const outsider = `Bearer ${other.token}`;
    const path = '/api/employees/bank-directory';
    const accountId = await createHistoricalBankAccount(tenant.companyId);
    const additions = await Promise.all(
      ['Example Bank', 'EXAMPLE BANK'].map((name) =>
        api.post(path).set('Authorization', admin).send({ name }),
      ),
    );
    expect(additions.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const bankId = additions.find((response) => response.status === 201)!.body
      .id as number;
    const bankPath = `${path}/${bankId}`;
    const image = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJZkAAAAASUVORK5CYII=',
      'base64',
    );
    const logo = await api
      .post(bankPath + '/logo')
      .set('Authorization', admin)
      .attach('file', image, { filename: 'bank.png', contentType: 'image/png' })
      .expect(201);
    expect(logo.body.logo_url).toContain(
      `/companies/${tenant.companyId}/bank-logos/bank-${bankId}-`,
    );
    const cleared = await api
      .patch(bankPath)
      .set('Authorization', admin)
      .send({ logo_url: null })
      .expect(200);
    expect(cleared.body.logo_url).toBeNull();
    await api
      .post(path)
      .set('Authorization', admin)
      .send({ name: 'Second Bank' })
      .expect(201);
    await api
      .patch(bankPath)
      .set('Authorization', admin)
      .send({ name: ' second bank ' })
      .expect(409);
    await api
      .patch(bankPath)
      .set('Authorization', outsider)
      .send({ name: 'Other' })
      .expect(404);
    await api.delete(bankPath).set('Authorization', outsider).expect(404);
    await api
      .patch(bankPath)
      .set('Authorization', admin)
      .send({ name: 'Renamed Bank', is_active: false })
      .expect(200);
    expect(
      (await api.get(path).set('Authorization', admin).expect(200)).body,
    ).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: bankId })]),
    );
    expect(
      (
        await api
          .get(path + '/management')
          .set('Authorization', admin)
          .expect(200)
      ).body,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bankId,
          name: 'Renamed Bank',
          is_active: false,
        }),
      ]),
    );
    await api
      .patch(bankPath)
      .set('Authorization', admin)
      .send({ is_active: true })
      .expect(200);
    expect(
      (await api.get(path).set('Authorization', admin).expect(200)).body,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: bankId, is_active: true }),
      ]),
    );
    await api.delete(bankPath).set('Authorization', admin).expect(200);
    await api.delete(bankPath).set('Authorization', admin).expect(404);
    expect(
      await dataSource.query(
        'SELECT bank_name FROM employee_bank_accounts WHERE id=$1',
        [accountId],
      ),
    ).toEqual([{ bank_name: 'Example Bank' }]);
    await dataSource.query(
      'DELETE FROM company_user_roles WHERE company_user_id IN (SELECT id FROM company_users WHERE company_id=$1)',
      [other.companyId],
    );
    await api.get(path).set('Authorization', outsider).expect(200);
    await api
      .get(path + '/management')
      .set('Authorization', outsider)
      .expect(403);
    await api
      .patch(bankPath)
      .set('Authorization', outsider)
      .send({ name: 'Denied' })
      .expect(403);
    await api.delete(bankPath).set('Authorization', outsider).expect(403);
  });

  it('removes a company from use, retains history, and revokes only that company’s sessions', async () => {
    const api = request(app.getHttpServer() as App);
    const tenant = await companyFixture();
    const other = await companyFixture();
    const delegated = await createPlatformOwner('PLATFORM_ADMINISTRATOR');
    const admin = `Bearer ${tenant.platformToken}`;
    const path = `/api/companies/${tenant.companyId}`;
    const accountId = await createHistoricalBankAccount(tenant.companyId);
    await dataSource.query(
      'INSERT INTO company_users (company_id, user_id, status, is_default) SELECT $1, user_id, status, false FROM company_users WHERE company_id=$2',
      [tenant.companyId, other.companyId],
    );
    await api.delete(path).expect(401);
    await api
      .delete(path)
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(403);
    await api
      .delete(path)
      .set('Authorization', `Bearer ${delegated.token}`)
      .expect(403);
    await api.delete(path).set('Authorization', admin).expect(200);
    const list = await api
      .get('/api/companies')
      .set('Authorization', admin)
      .expect(200);
    const ids = (list.body as Company[]).map((company) => company.id);
    expect(ids).not.toContain(tenant.companyId);
    expect(ids).toContain(other.companyId);
    await api.get(path).set('Authorization', admin).expect(404);
    await api
      .get(path + '/modules')
      .set('Authorization', admin)
      .expect(404);
    await api
      .patch(path)
      .set('Authorization', admin)
      .send({ name: 'Removed' })
      .expect(404);
    await api
      .patch(path + '/modules')
      .set('Authorization', admin)
      .send({ roles: true })
      .expect(404);
    await api
      .post(path + '/activate')
      .set('Authorization', admin)
      .expect(404);
    await api.delete(path).set('Authorization', admin).expect(404);
    await api
      .post('/api/auth/switch-company')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ company_id: tenant.companyId })
      .expect(401);
    await api
      .get('/api/companies/my')
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(401);
    await api
      .get('/api/companies/my')
      .set('Authorization', `Bearer ${other.token}`)
      .expect(200);
    expect(
      await dataSource.query(
        'SELECT revocation_reason FROM auth_sessions WHERE company_id=$1',
        [tenant.companyId],
      ),
    ).toEqual(
      expect.arrayContaining([{ revocation_reason: 'company_deleted' }]),
    );
    expect(
      await dataSource.query(
        "SELECT event_type FROM security_events WHERE company_id=$1 AND event_type='COMPANY_DELETED'",
        [tenant.companyId],
      ),
    ).toEqual([{ event_type: 'COMPANY_DELETED' }]);
    expect(
      await dataSource.query(
        'SELECT bank_name FROM employee_bank_accounts WHERE id=$1',
        [accountId],
      ),
    ).toEqual([{ bank_name: 'Example Bank' }]);
  });

  it('persists split modules on company create, list, get, and my', async () => {
    const created = await createCompanyViaApi({
      modules: { roles: true, permissions: false },
    });

    expect(created.responseBody.data.company.modules).toEqual({
      roles: true,
      permissions: false,
    });
    expect(created.responseBody.data.company.metadata.modules).toEqual({
      roles: true,
      permissions: false,
    });

    const listResponse = await request(app.getHttpServer() as App)
      .get('/api/companies')
      .set('Authorization', `Bearer ${created.platformToken}`)
      .expect(200);
    const listedCompany = (
      listResponse.body as Array<Record<string, unknown>>
    ).find((item) => item.id === created.companyId);

    expect(listedCompany).toMatchObject({
      id: created.companyId,
      company_name: expect.any(String),
      company_slug: expect.any(String),
      modules: { roles: true, permissions: false },
      metadata: {
        modules: { roles: true, permissions: false },
      },
    });

    const getResponse = await request(app.getHttpServer() as App)
      .get(`/api/companies/${created.companyId}`)
      .set('Authorization', `Bearer ${created.platformToken}`)
      .expect(200);

    expect(getResponse.body.data.modules).toEqual({
      roles: true,
      permissions: false,
    });

    const adminToken = await loginCompanyAdmin(
      created.adminEmail,
      created.adminPassword,
      created.twoFactorSecret,
    );
    const myResponse = await request(app.getHttpServer() as App)
      .get('/api/companies/my')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(myResponse.body.data).toMatchObject({
      id: created.companyId,
      modules: { roles: true, permissions: false },
      metadata: {
        modules: { roles: true, permissions: false },
      },
    });
  });

  it('merges metadata flags on PATCH without wiping unrelated metadata', async () => {
    const created = await createCompanyViaApi({
      modules: { roles: true, permissions: true },
      metadata: { region: 'Uganda' },
    });

    const patchResponse = await request(app.getHttpServer() as App)
      .patch(`/api/companies/${created.companyId}`)
      .set('Authorization', `Bearer ${created.platformToken}`)
      .send({
        company_name: 'Alliance Uganda Updated',
        metadata: {
          timezone: 'Africa/Kampala',
          modules: {
            permissions: false,
          },
        },
      })
      .expect(200);

    expect(patchResponse.body.data).toMatchObject({
      company_name: 'Alliance Uganda Updated',
      modules: { roles: true, permissions: false },
      metadata: {
        region: 'Uganda',
        timezone: 'Africa/Kampala',
        modules: { roles: true, permissions: false },
      },
    });
  });

  it('updates company modules via the dedicated endpoint and rejects company-scoped updates', async () => {
    const created = await createCompanyViaApi({
      modules: { roles: true, permissions: true },
    });
    const adminToken = await loginCompanyAdmin(
      created.adminEmail,
      created.adminPassword,
      created.twoFactorSecret,
    );

    await request(app.getHttpServer() as App)
      .patch(`/api/companies/${created.companyId}/modules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissions: false })
      .expect(403);

    const firstPatch = await request(app.getHttpServer() as App)
      .patch(`/api/companies/${created.companyId}/modules`)
      .set('Authorization', `Bearer ${created.platformToken}`)
      .send({ roles: true, permissions: false })
      .expect(200);

    expect(firstPatch.body.data.modules).toEqual({
      roles: true,
      permissions: false,
    });

    const secondPatch = await request(app.getHttpServer() as App)
      .patch(`/api/companies/${created.companyId}/modules`)
      .set('Authorization', `Bearer ${created.platformToken}`)
      .send({ roles: false })
      .expect(200);

    expect(secondPatch.body.data.modules).toEqual({
      roles: false,
      permissions: false,
    });

    const getModules = await request(app.getHttpServer() as App)
      .get(`/api/companies/${created.companyId}/modules`)
      .set('Authorization', `Bearer ${created.platformToken}`)
      .expect(200);

    expect(getModules.body.data).toEqual({
      roles: false,
      permissions: false,
    });
  });

  it('blocks permission administration when permissions are disabled but still allows roles when roles stay enabled', async () => {
    const created = await createCompanyViaApi({
      modules: { roles: true, permissions: false },
    });
    const adminToken = await loginCompanyAdmin(
      created.adminEmail,
      created.adminPassword,
      created.twoFactorSecret,
    );

    await request(app.getHttpServer() as App)
      .get('/api/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403)
      .expect({
        success: false,
        message: 'Permissions are not enabled for this company',
        code: 'COMPANY_MODULE_DISABLED',
        module: 'permissions',
      });

    await request(app.getHttpServer() as App)
      .get('/api/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('blocks role administration when roles are disabled and still allows platform-scoped RBAC access', async () => {
    const created = await createCompanyViaApi({
      modules: { roles: false, permissions: true },
    });
    const adminToken = await loginCompanyAdmin(
      created.adminEmail,
      created.adminPassword,
      created.twoFactorSecret,
    );

    await request(app.getHttpServer() as App)
      .get('/api/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403)
      .expect({
        success: false,
        message: 'Roles are not enabled for this company',
        code: 'COMPANY_MODULE_DISABLED',
        module: 'roles',
      });

    await request(app.getHttpServer() as App)
      .get('/api/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer() as App)
      .get('/api/roles')
      .set('Authorization', `Bearer ${created.platformToken}`)
      .expect(200);

    await request(app.getHttpServer() as App)
      .get('/api/permissions')
      .set('Authorization', `Bearer ${created.platformToken}`)
      .expect(200);
  });

  it('treats missing metadata as fully enabled and legacy access_governance false as both disabled', async () => {
    const created = await createCompanyViaApi({
      modules: { roles: true, permissions: true },
      metadata: { region: 'Legacy Test' },
    });
    const adminToken = await loginCompanyAdmin(
      created.adminEmail,
      created.adminPassword,
      created.twoFactorSecret,
    );

    await dataSource.getRepository(Company).update(created.companyId, {
      metadata: null,
    });

    const defaultedCompany = await request(app.getHttpServer() as App)
      .get('/api/companies/my')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(defaultedCompany.body.data.modules).toEqual({
      roles: true,
      permissions: true,
    });
    expect(defaultedCompany.body.data.metadata.modules).toEqual({
      roles: true,
      permissions: true,
    });

    await request(app.getHttpServer() as App)
      .get('/api/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer() as App)
      .get('/api/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await dataSource.getRepository(Company).update(created.companyId, {
      metadata: {
        region: 'Legacy Test',
        modules: {
          access_governance: false,
        },
      } as Record<string, unknown>,
    });

    const legacyCompany = await request(app.getHttpServer() as App)
      .get('/api/companies/my')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(legacyCompany.body.data.modules).toEqual({
      roles: false,
      permissions: false,
    });
    expect(legacyCompany.body.data.metadata.modules).toEqual({
      roles: false,
      permissions: false,
    });

    await request(app.getHttpServer() as App)
      .get('/api/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403)
      .expect({
        success: false,
        message: 'Roles are not enabled for this company',
        code: 'COMPANY_MODULE_DISABLED',
        module: 'roles',
      });

    await request(app.getHttpServer() as App)
      .get('/api/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403)
      .expect({
        success: false,
        message: 'Permissions are not enabled for this company',
        code: 'COMPANY_MODULE_DISABLED',
        module: 'permissions',
      });
  });
});
