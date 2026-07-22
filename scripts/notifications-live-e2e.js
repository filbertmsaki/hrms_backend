require('dotenv').config();
require('reflect-metadata');
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');

const assert = require('node:assert/strict');
const { Client } = require('pg');
const { Module, RequestMethod, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { ConfigModule } = require('@nestjs/config');
const { TypeOrmModule } = require('@nestjs/typeorm');

const { AuthModule } = require('../src/modules/auth/auth.module');
const { NotificationsModule } = require('../src/modules/notifications/notifications.module');
const { HttpExceptionFilter } = require('../src/common/filters/http-exception.filter');
const { validateEnv } = require('../src/config/env.validation');

const senderEmail = process.env.NOTIF_TEST_SENDER_EMAIL || 'admin@alliance.co.tz';
const senderPassword =
  process.env.NOTIF_TEST_SENDER_PASSWORD || 'Admin123!';
const receiverEmail =
  process.env.NOTIF_TEST_RECEIVER_EMAIL || 'rajiv.kumar@alliance.co.tz';
const receiverPassword =
  process.env.NOTIF_TEST_RECEIVER_PASSWORD || 'Employee123!';

class NotificationsLiveE2EModule {}
Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hrms_db',
      autoLoadEntities: true,
      synchronize: false,
      logging: false,
    }),
    AuthModule,
    NotificationsModule,
  ],
})(NotificationsLiveE2EModule);

function logStep(message) {
  console.log(`\n[notifications-live-e2e] ${message}`);
}

async function apiJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(
      `${options.method || 'GET'} ${path} failed with ${response.status}: ${text}`,
    );
    error.response = body;
    throw error;
  }

  return body;
}

async function login(baseUrl, email, password) {
  const body = await apiJson(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (body.requires2FA) {
    throw new Error(`2FA is enabled for ${email}; this script does not complete interactive 2FA.`);
  }

  if (body.requiresEmailVerification) {
    throw new Error(
      `Email verification is still required for ${email}; verify the account before running this script.`,
    );
  }

  assert.ok(body.access_token, `Expected an access token for ${email}`);
  assert.equal(body.scope, 'company', `Expected company scope for ${email}`);
  assert.ok(body.company?.id, `Expected a company context for ${email}`);

  return body;
}

async function getMembership(client, email) {
  const result = await client.query(
    `
      select
        cu.id as company_user_id,
        cu.company_id,
        u.id as user_id,
        u.email,
        u.first_name,
        u.last_name
      from company_users cu
      join users u on u.id = cu.user_id
      where lower(u.email) = lower($1)
        and cu.status = 'active'
      order by cu.id asc
      limit 1
    `,
    [email],
  );

  assert.equal(result.rowCount, 1, `Expected an active company membership for ${email}`);
  return result.rows[0];
}

async function getUnreadCount(client, companyUserId) {
  const result = await client.query(
    `
      select count(*)::int as unread_count
      from notifications
      where receiver_company_user_id = $1
        and status = 'UNREAD'
        and archived_at is null
    `,
    [companyUserId],
  );

  return result.rows[0].unread_count;
}

async function getNotificationColumns(client) {
  const result = await client.query(
    `
      select column_name
      from information_schema.columns
      where table_name = 'notifications'
      order by ordinal_position
    `,
  );

  return result.rows.map((row) => row.column_name);
}

async function getAppliedMigrationNames(client) {
  const result = await client.query(
    `
      select name
      from migrations
      order by id asc
    `,
  );

  return result.rows.map((row) => row.name);
}

async function assertNotificationsSchema(client) {
  const columns = await getNotificationColumns(client);
  const appliedMigrations = await getAppliedMigrationNames(client);
  const requiredColumns = [
    'category',
    'priority',
    'related_module',
    'branch_id',
    'department_id',
    'seen_at',
    'delivery_channel',
    'delivery_status',
    'dedupe_key',
    'expires_at',
    'archived_at',
  ];
  const missingColumns = requiredColumns.filter(
    (column) => !columns.includes(column),
  );

  if (!missingColumns.length) {
    return;
  }

  const hasExpandMigration = appliedMigrations.includes(
    'ExpandNotifications1786408000000',
  );
  const migrationHint = hasExpandMigration
    ? 'The migration record exists, but the notifications table is still missing columns.'
    : 'The notifications expansion migration does not appear in the migrations table.';

  throw new Error(
    [
      'The live notifications schema is behind the current code.',
      `Missing columns: ${missingColumns.join(', ')}`,
      migrationHint,
      'Expected migration: ExpandNotifications1786408000000',
    ].join(' '),
  );
}

async function getNotificationRow(client, dedupeKey) {
  const result = await client.query(
    `
      select
        id,
        company_id,
        sender_company_user_id,
        receiver_company_user_id,
        type,
        title,
        message,
        status,
        dedupe_key,
        seen_at,
        read_at,
        archived_at,
        created_at,
        updated_at
      from notifications
      where dedupe_key = $1
      order by id desc
      limit 1
    `,
    [dedupeKey],
  );

  assert.equal(result.rowCount, 1, `Expected a notification row for dedupe key ${dedupeKey}`);
  return result.rows[0];
}

async function getNotificationCountByDedupe(client, dedupeKey) {
  const result = await client.query(
    `
      select count(*)::int as notification_count
      from notifications
      where dedupe_key = $1
    `,
    [dedupeKey],
  );

  return result.rows[0].notification_count;
}

async function main() {
  const pgClient = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  let app;

  try {
    await pgClient.connect();
    logStep(`Connected to ${process.env.DB_NAME} on ${process.env.DB_HOST}:${process.env.DB_PORT}`);

    const senderMembership = await getMembership(pgClient, senderEmail);
    const receiverMembership = await getMembership(pgClient, receiverEmail);

    assert.equal(
      senderMembership.company_id,
      receiverMembership.company_id,
      'Sender and receiver must belong to the same company for this test.',
    );

    logStep(
      `Using sender ${senderMembership.email} (company_user_id=${senderMembership.company_user_id}) and receiver ${receiverMembership.email} (company_user_id=${receiverMembership.company_user_id})`,
    );

    await assertNotificationsSchema(pgClient);
    logStep('Notifications table schema matches the current service expectations');

    const baselineUnread = await getUnreadCount(
      pgClient,
      receiverMembership.company_user_id,
    );
    logStep(`Receiver baseline unread count: ${baselineUnread}`);

    app = await NestFactory.create(NotificationsLiveE2EModule, {
      logger: ['error', 'warn'],
    });
    app.setGlobalPrefix('api', {
      exclude: [{ path: '', method: RequestMethod.GET }],
    });
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address();
    const port = typeof address === 'string' ? address : address.port;
    const baseUrl = `http://127.0.0.1:${port}`;

    logStep(`Minimal notifications test app started on ${baseUrl}`);

    const senderAuth = await login(baseUrl, senderEmail, senderPassword);
    const receiverAuth = await login(baseUrl, receiverEmail, receiverPassword);

    logStep('Both users authenticated successfully through the real auth controller');

    const runId = `${Date.now()}`;
    const dedupeKey = `notif-live-e2e:${runId}`;
    const title = `E2E notification ${runId}`;
    const message = `Live notifications test at ${new Date().toISOString()}`;

    const createBody = {
      receiver_company_user_id: receiverMembership.company_user_id,
      title,
      message,
      type: 'GENERAL',
      related_module: 'notifications',
      entity_type: 'E2E_TEST',
      entity_id: runId,
      action_url: `/notifications/e2e/${runId}`,
      dedupe_key: dedupeKey,
      metadata: {
        test_run: runId,
        sender_email: senderEmail,
        receiver_email: receiverEmail,
      },
    };

    const created = await apiJson(baseUrl, '/api/notifications/test', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${senderAuth.access_token}`,
      },
      body: JSON.stringify(createBody),
    });

    assert.equal(created.title, title);
    assert.equal(created.message, message);
    assert.equal(
      created.receiver_company_user_id,
      receiverMembership.company_user_id,
    );
    assert.equal(created.sender_company_user_id, senderMembership.company_user_id);
    assert.equal(created.status, 'UNREAD');
    assert.equal(created.dedupe_key, dedupeKey);

    logStep(`Notification created through the controller with id=${created.id}`);

    const createdRow = await getNotificationRow(pgClient, dedupeKey);
    assert.equal(createdRow.id, created.id);
    assert.equal(createdRow.status, 'UNREAD');
    assert.equal(createdRow.archived_at, null);

    const unreadAfterCreate = await apiJson(
      baseUrl,
      '/api/notifications/unread-count',
      {
        headers: {
          authorization: `Bearer ${receiverAuth.access_token}`,
        },
      },
    );
    assert.equal(unreadAfterCreate.unread_count, baselineUnread + 1);

    const mine = await apiJson(
      baseUrl,
      `/api/notifications?search=${encodeURIComponent(runId)}`,
      {
        headers: {
          authorization: `Bearer ${receiverAuth.access_token}`,
        },
      },
    );

    assert.ok(Array.isArray(mine.data), 'Expected notification list data');
    assert.ok(
      mine.data.some((item) => item.id === created.id),
      'Receiver notification list should include the created notification',
    );

    logStep('Receiver can see the new notification and unread count increased');

    const duplicate = await apiJson(baseUrl, '/api/notifications/test', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${senderAuth.access_token}`,
      },
      body: JSON.stringify(createBody),
    });

    assert.equal(
      duplicate.id,
      created.id,
      'Duplicate create should return the existing notification',
    );
    assert.equal(await getNotificationCountByDedupe(pgClient, dedupeKey), 1);

    logStep('Dedupe behavior is working: the second create call did not insert a second row');

    const seen = await apiJson(baseUrl, `/api/notifications/${created.id}/seen`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${receiverAuth.access_token}`,
      },
    });
    assert.ok(seen.seen_at, 'Expected seen_at after marking as seen');

    const read = await apiJson(baseUrl, `/api/notifications/${created.id}/read`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${receiverAuth.access_token}`,
      },
    });
    assert.equal(read.status, 'READ');
    assert.ok(read.read_at, 'Expected read_at after marking as read');

    const rowAfterRead = await getNotificationRow(pgClient, dedupeKey);
    assert.equal(rowAfterRead.status, 'READ');
    assert.notEqual(rowAfterRead.seen_at, null);
    assert.notEqual(rowAfterRead.read_at, null);

    const unreadAfterRead = await apiJson(
      baseUrl,
      '/api/notifications/unread-count',
      {
        headers: {
          authorization: `Bearer ${receiverAuth.access_token}`,
        },
      },
    );
    assert.equal(unreadAfterRead.unread_count, baselineUnread);

    logStep('Seen/read lifecycle is working and unread count returned to baseline');

    const archived = await apiJson(baseUrl, `/api/notifications/${created.id}`, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${receiverAuth.access_token}`,
      },
    });
    assert.ok(archived.archived_at, 'Expected archived_at after archiving');

    const rowAfterArchive = await getNotificationRow(pgClient, dedupeKey);
    assert.notEqual(rowAfterArchive.archived_at, null);

    const visibleAfterArchive = await apiJson(
      baseUrl,
      `/api/notifications?search=${encodeURIComponent(runId)}`,
      {
        headers: {
          authorization: `Bearer ${receiverAuth.access_token}`,
        },
      },
    );
    assert.ok(
      !visibleAfterArchive.data.some((item) => item.id === created.id),
      'Archived notification should be hidden from the default list',
    );

    const archivedVisible = await apiJson(
      baseUrl,
      `/api/notifications?search=${encodeURIComponent(runId)}&include_archived=true`,
      {
        headers: {
          authorization: `Bearer ${receiverAuth.access_token}`,
        },
      },
    );
    assert.ok(
      archivedVisible.data.some((item) => item.id === created.id),
      'Archived notification should still be retrievable when include_archived=true',
    );

    logStep('Archive behavior is working and default list filtering is correct');

    console.log('\n[notifications-live-e2e] PASS');
    console.log(
      JSON.stringify(
        {
          sender_email: senderEmail,
          receiver_email: receiverEmail,
          notification_id: created.id,
          dedupe_key: dedupeKey,
          receiver_unread_baseline: baselineUnread,
        },
        null,
        2,
      ),
    );
  } finally {
    if (app) {
      await app.close();
    }
    await pgClient.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error('\n[notifications-live-e2e] FAIL');
  console.error(error?.stack || error);
  process.exit(1);
});
