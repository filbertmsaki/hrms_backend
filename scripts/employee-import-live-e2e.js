require('dotenv').config();
require('reflect-metadata');
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { NestFactory } = require('@nestjs/core');
const { Module, RequestMethod, ValidationPipe } = require('@nestjs/common');
const { BullModule } = require('@nestjs/bullmq');
const { ConfigModule, ConfigService } = require('@nestjs/config');
const { EventEmitterModule } = require('@nestjs/event-emitter');
const { ScheduleModule } = require('@nestjs/schedule');
const { ThrottlerModule } = require('@nestjs/throttler');
const { TypeOrmModule } = require('@nestjs/typeorm');

const { HttpExceptionFilter } = require('../src/common/filters/http-exception.filter');
const { validateEnv } = require('../src/config/env.validation');
const { AuthModule } = require('../src/modules/auth/auth.module');
const { EmployeesModule } = require('../src/modules/hr/employees/employees.module');

const configuredBaseUrl =
  process.env.EMPLOYEE_IMPORT_TEST_BASE_URL ||
  process.env.APP_URL ||
  'http://127.0.0.1:8888';
let apiBaseUrl = `${configuredBaseUrl.replace(/\/$/, '')}/api`;

class EmployeeImportLiveE2EModule {}
Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService) => ({
        connection: {
          url:
            configService.get('REDIS_URL') || 'redis://127.0.0.1:6379',
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService) => [
        {
          name: 'default',
          ttl: Number(configService.get('THROTTLER_TTL') || 60000),
          limit: Number(configService.get('THROTTLER_LIMIT') || 100),
        },
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: Number(configService.get('DB_PORT', 5432)),
        username: configService.get('DB_USERNAME', 'postgres'),
        password: configService.get('DB_PASSWORD', ''),
        database: configService.get('DB_NAME', 'hrms_db'),
        entities: [__dirname + '/../src/**/*.entity{.ts,.js}'],
        synchronize: false,
        logging: false,
      }),
    }),
    AuthModule,
    EmployeesModule,
  ],
})(EmployeeImportLiveE2EModule);

const innocentEmail =
  process.env.EMPLOYEE_IMPORT_INNOCENT_EMAIL || 'inocent@alliance.co.tz';
const innocentPassword =
  process.env.EMPLOYEE_IMPORT_INNOCENT_PASSWORD || 'Employee123!';

const fallbackHrEmail =
  process.env.EMPLOYEE_IMPORT_HR_EMAIL || 'rajiv.kumar@alliance.co.tz';
const fallbackHrPassword =
  process.env.EMPLOYEE_IMPORT_HR_PASSWORD || 'Employee123!';

function logStep(message) {
  console.log(`\n[employee-import-live-e2e] ${message}`);
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  return response.text();
}

async function apiJson(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const body = await parseResponse(response);

  if (!response.ok) {
    const error = new Error(
      `${options.method || 'GET'} ${path} failed with ${response.status}`,
    );
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

async function apiBuffer(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const body = await response.arrayBuffer();

  if (!response.ok) {
    const text = Buffer.from(body).toString('utf8');
    const error = new Error(
      `${options.method || 'GET'} ${path} failed with ${response.status}: ${text}`,
    );
    error.status = response.status;
    error.body = text;
    throw error;
  }

  return Buffer.from(body);
}

async function login(email, password) {
  const body = await apiJson('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (body.requires2FA || body.requires_2fa) {
    throw new Error(`2FA is enabled for ${email}; live script cannot complete it.`);
  }

  if (body.requiresEmailVerification || body.requires_email_verification) {
    throw new Error(`Email verification is still required for ${email}.`);
  }

  assert.ok(body.access_token, `Expected an access token for ${email}`);
  return body;
}

async function canDownloadTemplate(accessToken) {
  try {
    await apiBuffer('/employees/import/template', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    return { allowed: true };
  } catch (error) {
    return {
      allowed: false,
      status: error.status,
      body: error.body,
    };
  }
}

function buildRowFromHeaders(headers, rowData) {
  return headers.map((header) =>
    Object.prototype.hasOwnProperty.call(rowData, header)
      ? rowData[header]
      : undefined,
  );
}

async function buildWorkbookFromTemplate(templateBuffer, rowData) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);

  const sheet = workbook.getWorksheet('Employees');
  assert.ok(sheet, 'Template workbook is missing the Employees sheet');

  const headerRow = sheet.getRow(1);
  const headers = [];
  for (let i = 1; i <= headerRow.cellCount; i += 1) {
    headers.push(String(headerRow.getCell(i).value || '').trim());
  }

  if (sheet.rowCount > 1) {
    sheet.spliceRows(2, sheet.rowCount - 1);
  }

  const row = buildRowFromHeaders(headers, rowData);
  sheet.addRow(row);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function previewImport(accessToken, fileBuffer, fileName) {
  const form = new FormData();
  form.append('import_mode', 'CREATE_ONLY');
  form.append('process_valid_rows_only', 'true');
  form.append(
    'file',
    new Blob(
      [fileBuffer],
      {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ),
    fileName,
  );

  return apiJson('/employees/import/preview', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
    body: form,
  });
}

async function confirmImport(accessToken, previewToken) {
  return apiJson('/employees/import/confirm', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      preview_token: previewToken,
      process_valid_rows_only: true,
    }),
  });
}

async function getEmployee(accessToken, employeeId) {
  return apiJson(`/employees/${employeeId}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

async function getHistory(accessToken) {
  return apiJson('/employees/import/history?page=1&limit=10', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

async function downloadResult(accessToken, batchId) {
  return apiBuffer(`/employees/import/${batchId}/result`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

async function parseResultWorkbook(resultBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(resultBuffer);

  const sheet = workbook.getWorksheet('Import Results');
  assert.ok(sheet, 'Import result workbook is missing the Import Results sheet');

  const headers = [];
  const headerRow = sheet.getRow(1);
  for (let i = 1; i <= headerRow.cellCount; i += 1) {
    headers.push(String(headerRow.getCell(i).value || '').trim());
  }

  const firstDataRow = sheet.getRow(2);
  const record = {};

  for (let i = 1; i <= headers.length; i += 1) {
    record[headers[i - 1]] = firstDataRow.getCell(i).value;
  }

  return record;
}

function buildUniqueImportRow() {
  const runId = `${Date.now()}`;
  const suffix = runId.slice(-6);

  return {
    runId,
    fileName: `employee-import-${runId}.xlsx`,
    row: {
      first_name: 'Api',
      middle_name: 'E2E',
      last_name: `Import${suffix}`,
      employee_number: `E2E-IMP-${suffix}`,
      email: `employee.import.${runId}@alliance.co.tz`,
      gender: 'male',
      employment_date: '2026-07-27',
      branch_code: 'HQ',
      department_code: 'IT',
      position_code: 'IT_OFFICER',
      employment_type: 'full_time',
    },
  };
}

async function startEmbeddedApp() {
  const app = await NestFactory.create(EmployeeImportLiveE2EModule, {
    logger: ['error', 'warn', 'log'],
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

  return {
    app,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

async function main() {
  let embeddedApp = null;

  try {
    logStep(`Initial base URL: ${apiBaseUrl}`);

    let innocentAuth;
    try {
      innocentAuth = await login(innocentEmail, innocentPassword);
    } catch (error) {
      if (error instanceof TypeError) {
        logStep(
          'Configured API base URL is not reachable. Starting an embedded Nest app for the live API test.',
        );
        embeddedApp = await startEmbeddedApp();
        apiBaseUrl = `${embeddedApp.baseUrl}/api`;
        logStep(`Embedded base URL: ${apiBaseUrl}`);
        innocentAuth = await login(innocentEmail, innocentPassword);
      } else {
        throw error;
      }
    }

    logStep(
      `Logged in as ${innocentEmail} in company "${innocentAuth.company?.name || 'unknown'}"`,
    );

    const innocentTemplateAccess = await canDownloadTemplate(
      innocentAuth.access_token,
    );

    let actorLabel = 'Inocent';
    let actorAuth = innocentAuth;
    let innocentResult = null;

    if (!innocentTemplateAccess.allowed) {
      innocentResult = {
        status: innocentTemplateAccess.status,
        body: innocentTemplateAccess.body,
      };
      logStep(
        `Inocent cannot access employee import template (${innocentTemplateAccess.status}). Falling back to ${fallbackHrEmail} for the positive-path import.`,
      );
      actorAuth = await login(fallbackHrEmail, fallbackHrPassword);
      actorLabel = fallbackHrEmail;
    } else {
      logStep('Inocent can access the employee import endpoints directly.');
    }

    const templateBuffer = await apiBuffer('/employees/import/template', {
      headers: { authorization: `Bearer ${actorAuth.access_token}` },
    });
    logStep(`Downloaded import template as ${actorLabel}`);

    const importSeed = buildUniqueImportRow();
    const workbookBuffer = await buildWorkbookFromTemplate(
      templateBuffer,
      importSeed.row,
    );

    const preview = await previewImport(
      actorAuth.access_token,
      workbookBuffer,
      importSeed.fileName,
    );

    if (preview.totalRows !== 1 || preview.validRows !== 1 || preview.invalidRows !== 0) {
      console.log(
        '[employee-import-live-e2e] Preview diagnostic:',
        JSON.stringify(preview, null, 2),
      );
    }

    assert.equal(preview.totalRows, 1, 'Expected exactly one preview row');
    assert.equal(preview.validRows, 1, 'Expected the preview row to be valid');
    assert.equal(preview.invalidRows, 0, 'Expected zero invalid preview rows');
    assert.ok(preview.previewToken, 'Expected a preview token');

    logStep(
      `Preview succeeded with batch ${preview.batchId} and token ${preview.previewToken}`,
    );

    const confirmation = await confirmImport(
      actorAuth.access_token,
      preview.previewToken,
    );

    assert.equal(
      confirmation.totalRows,
      1,
      'Expected exactly one imported row',
    );
    assert.equal(
      confirmation.successfulRows,
      1,
      'Expected the import to succeed for one row',
    );
    assert.equal(confirmation.failedRows, 0, 'Expected zero failed rows');
    assert.equal(
      confirmation.createdEmployees,
      1,
      'Expected one created employee from CREATE_ONLY import',
    );

    const importedRow = confirmation.rows[0];
    const importedEmployeeId = importedRow?.employeeId ?? importedRow?.employee_id;
    assert.ok(importedRow, 'Expected at least one result row');
    assert.equal(importedRow.status, 'IMPORTED');
    assert.ok(importedEmployeeId, 'Expected an imported employee id');

    logStep(
      `Confirm succeeded with batch ${confirmation.batchId}; employee_id=${importedEmployeeId}`,
    );

    const employee = await getEmployee(
      actorAuth.access_token,
      importedEmployeeId,
    );
    const employeeEmail =
      employee.email ||
      employee.company_user?.user?.email ||
      employee.companyUser?.user?.email ||
      '';

    assert.equal(employee.first_name, importSeed.row.first_name);
    assert.equal(employee.last_name, importSeed.row.last_name);
    assert.equal(employee.gender, importSeed.row.gender);
    assert.equal(
      employeeEmail.toLowerCase(),
      importSeed.row.email.toLowerCase(),
    );

    const history = await getHistory(actorAuth.access_token);
    assert.ok(Array.isArray(history.data), 'Expected import history data array');
    assert.ok(
      history.data.some((item) => item.batchId === confirmation.batchId),
      'Expected the new batch to appear in import history',
    );

    const resultBuffer = await downloadResult(
      actorAuth.access_token,
      confirmation.batchId,
    );
    const resultRow = await parseResultWorkbook(resultBuffer);

    assert.equal(String(resultRow.status), 'IMPORTED');
    assert.equal(String(resultRow.employee_id), String(importedEmployeeId));

    console.log('\n[employee-import-live-e2e] PASS');
    console.log(
      JSON.stringify(
        {
          base_url: apiBaseUrl,
          innocent_email: innocentEmail,
          innocent_import_access: innocentTemplateAccess.allowed
            ? { allowed: true }
            : {
                allowed: false,
                status: innocentResult.status,
                body: innocentResult.body,
              },
          import_actor: actorLabel,
          batch_id: confirmation.batchId,
          preview_token: preview.previewToken,
          employee_id: importedEmployeeId,
          employee_email: importSeed.row.email,
          employee_number: importSeed.row.employee_number,
          history_status: confirmation.status,
          result_row_status: resultRow.status,
        },
        null,
        2,
      ),
    );
  } finally {
    if (embeddedApp?.app) {
      await embeddedApp.app.close();
    }
  }
}

main().catch((error) => {
  console.error('\n[employee-import-live-e2e] FAIL');
  console.error(error?.stack || error);
  if (error?.body !== undefined) {
    console.error('[employee-import-live-e2e] Error body:');
    console.error(
      typeof error.body === 'string'
        ? error.body
        : JSON.stringify(error.body, null, 2),
    );
  }
  process.exit(1);
});
