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
import { Role } from '../src/modules/roles/entities/role.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { createE2eApp } from './helpers/create-e2e-app';

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

  async function createPlatformOwner() {
    const suffix = nextSuffix();
    const password = 'PlatformOwner!2026';
    const superAdminRole = await dataSource
      .getRepository(Role)
      .createQueryBuilder('role')
      .where('role.name = :name', { name: 'SUPER_ADMIN' })
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
        admin_phone: `+2567${suffix}`.slice(0, 13),
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

    return {
      platformToken: platform.token,
      adminPassword,
      adminEmail: response.body.data.administrator.email as string,
      companyId,
      responseBody: response.body,
    };
  }

  async function loginCompanyAdmin(email: string, password: string) {
    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .set('X-Forwarded-For', nextLoginIp())
      .send({ email, password })
      .expect(201);

    return response.body.access_token as string;
  }

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
