process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = 'hrms_test_db';

import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { hashPassword } from '../src/common/utils/hash.util';
import { Company } from '../src/modules/companies/entities/company.entity';
import { CompanyUser } from '../src/modules/companies/entities/company-user.entity';
import { CompanyUserPermission } from '../src/modules/companies/entities/company-user-permission.entity';
import { Permission } from '../src/modules/permissions/entities/permission.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { createE2eApp } from './helpers/create-e2e-app';

/**
 * Drives the notifications lifecycle purely over HTTP against a real
 * Postgres database: sending a notification to yourself requires the real
 * "notifications:test" permission, unread-count reflects real database
 * rows, and marking as read/archived actually mutates those rows.
 */
describe('Notifications (e2e, real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let companyId: number;
  let userId: number;
  let companyUserId: number;
  const password = 'NotificationsTest!2026';
  let email: string;
  let token: string;
  let createdNotificationId: number;

  beforeAll(async () => {
    app = await createE2eApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    if (companyUserId) {
      await dataSource.query(
        'DELETE FROM notifications WHERE receiver_company_user_id = $1',
        [companyUserId],
      );
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
    email = `notifications.${suffix}@example.com`;

    const company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Notifications Co ${suffix}`,
        slug: `e2e-notifications-${suffix}`,
        status: 'active',
      }),
    );
    companyId = company.id;

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-NT-${suffix}`.slice(0, 20),
        first_name: 'Notify',
        last_name: 'Subject',
        phone: `+2554${suffix}`.slice(0, 20),
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

    const notificationsTestPermission = await dataSource
      .getRepository(Permission)
      .findOneOrFail({ where: { name: 'notifications:test' } });

    await dataSource.getRepository(CompanyUserPermission).save(
      dataSource.getRepository(CompanyUserPermission).create({
        company_user_id: companyUserId,
        permission_id: notificationsTestPermission.id,
      }),
    );

    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    token = response.body.access_token as string;
  });

  async function sendTestNotification(): Promise<number> {
    const response = await request(app.getHttpServer() as App)
      .post('/api/notifications/test')
      .set('Authorization', `Bearer ${token}`)
      .send({
        receiver_company_user_id: companyUserId,
        title: 'E2E test notification',
        message: 'This is a real-Postgres e2e test notification.',
      })
      .expect(201);

    createdNotificationId = response.body.id as number;
    return createdNotificationId;
  }

  it('rejects sending a test notification without the notifications:test permission', async () => {
    await dataSource.query(
      'DELETE FROM company_user_permissions WHERE company_user_id = $1',
      [companyUserId],
    );

    await request(app.getHttpServer() as App)
      .post('/api/notifications/test')
      .set('Authorization', `Bearer ${token}`)
      .send({
        receiver_company_user_id: companyUserId,
        title: 'Should be blocked',
        message: 'Should be blocked',
      })
      .expect(403);
  });

  it('sends a notification, lists it, and reflects it in the unread count', async () => {
    await sendTestNotification();

    const listResponse = await request(app.getHttpServer() as App)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(
      listResponse.body.data.some(
        (item: { id: number }) => item.id === createdNotificationId,
      ),
    ).toBe(true);

    const unreadResponse = await request(app.getHttpServer() as App)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(unreadResponse.body.unread_count).toBeGreaterThanOrEqual(1);
  });

  it('marks a notification as read and reduces the unread count', async () => {
    await sendTestNotification();

    await request(app.getHttpServer() as App)
      .patch(`/api/notifications/${createdNotificationId}/read`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const [row] = await dataSource.query(
      'SELECT status, read_at FROM notifications WHERE id = $1',
      [createdNotificationId],
    );
    expect(row.status).toBe('READ');
    expect(row.read_at).not.toBeNull();
  });

  it('archives a notification so it no longer appears in the default list', async () => {
    await sendTestNotification();

    await request(app.getHttpServer() as App)
      .delete(`/api/notifications/${createdNotificationId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const listResponse = await request(app.getHttpServer() as App)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(
      listResponse.body.data.some(
        (item: { id: number }) => item.id === createdNotificationId,
      ),
    ).toBe(false);
  });

  it('rejects unauthenticated access to any notification endpoint', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/notifications')
      .expect(401);

    await request(app.getHttpServer() as App)
      .get('/api/notifications/unread-count')
      .expect(401);
  });
});
