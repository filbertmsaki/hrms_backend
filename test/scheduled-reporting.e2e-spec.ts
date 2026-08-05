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
import { ReportDefinition } from '../src/modules/scheduled-reporting/entities/report-definition.entity';
import { ReportTemplate } from '../src/modules/scheduled-reporting/entities/report-template.entity';
import { ReportSmtpConfiguration } from '../src/modules/scheduled-reporting/entities/report-smtp-configuration.entity';
import { ReportSmtpSecurityTypeEnum } from '../src/modules/scheduled-reporting/enums/report-smtp-security-type.enum';
import { ReportSmtpTestStatusEnum } from '../src/modules/scheduled-reporting/enums/report-smtp-test-status.enum';
import { ReportOutputFormatEnum } from '../src/modules/scheduled-reporting/enums/report-output-format.enum';
import { ReportRecipientChannelEnum } from '../src/modules/scheduled-reporting/enums/report-recipient-channel.enum';
import { ReportRecipientTypeEnum } from '../src/modules/scheduled-reporting/enums/report-recipient-type.enum';
import { encryptReportSmtpSecret } from '../src/modules/scheduled-reporting/utils/report-smtp-secret.util';
import { Permission } from '../src/modules/permissions/entities/permission.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { createE2eApp } from './helpers/create-e2e-app';

/**
 * Drives the scheduled-reporting API over real HTTP: permission gating on
 * templates/executions, creating a template against the real
 * EMPLOYEE_DIRECTORY report definition, and manually queuing an execution
 * -- proving the "run now" endpoint actually creates a real, durable
 * report_executions row rather than just accepting the request.
 */
describe('Scheduled reporting (e2e, real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let companyId: number;
  let userId: number;
  let companyUserId: number;
  let smtpConfigurationId: number;
  let templateId: number;
  let executionId: number;
  let reportDefinitionId: number;
  const password = 'ScheduledReporting!2026';
  let email: string;
  let token: string;

  beforeAll(async () => {
    app = await createE2eApp();
    dataSource = app.get(DataSource);

    const reportDefinition = await dataSource
      .getRepository(ReportDefinition)
      .findOneOrFail({ where: { reportCode: 'EMPLOYEE_DIRECTORY' } });
    reportDefinitionId = reportDefinition.id;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    if (executionId) {
      await dataSource.query('DELETE FROM report_executions WHERE id = $1', [
        executionId,
      ]);
    }
    if (templateId) {
      await dataSource.query(
        'DELETE FROM report_template_recipients WHERE template_id = $1',
        [templateId],
      );
      await dataSource.query('DELETE FROM report_templates WHERE id = $1', [
        templateId,
      ]);
    }
    if (smtpConfigurationId) {
      await dataSource.query(
        'DELETE FROM report_smtp_configurations WHERE id = $1',
        [smtpConfigurationId],
      );
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
    email = `scheduled.reporting.${suffix}@example.com`;

    const company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Scheduled Reporting Co ${suffix}`,
        slug: `e2e-scheduled-reporting-${suffix}`,
        status: 'active',
      }),
    );
    companyId = company.id;

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-SR-${suffix}`.slice(0, 20),
        first_name: 'Report',
        last_name: 'Operator',
        phone: `+2555${suffix}`.slice(0, 20),
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

    const permissions = await dataSource.getRepository(Permission).find({
      where: [
        { name: 'scheduled_reports:read' },
        { name: 'scheduled_reports:create' },
        { name: 'scheduled_reports:run' },
      ],
    });

    for (const permission of permissions) {
      await dataSource.getRepository(CompanyUserPermission).save(
        dataSource.getRepository(CompanyUserPermission).create({
          company_user_id: companyUserId,
          permission_id: permission.id,
        }),
      );
    }

    const smtpConfiguration = await dataSource
      .getRepository(ReportSmtpConfiguration)
      .save(
        dataSource.getRepository(ReportSmtpConfiguration).create({
          companyId,
          name: `E2E SMTP ${suffix}`,
          host: 'smtp.example.com',
          port: 587,
          securityType: ReportSmtpSecurityTypeEnum.STARTTLS,
          username: 'reports@example.com',
          encryptedPassword: encryptReportSmtpSecret('not-a-real-password'),
          senderEmail: 'reports@example.com',
          senderName: 'HRMS Reports',
          isActive: true,
          isDefault: true,
          lastTestStatus: ReportSmtpTestStatusEnum.SUCCESS,
          lastTestedAt: new Date(),
        }),
      );
    smtpConfigurationId = smtpConfiguration.id;

    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    token = response.body.access_token as string;
  });

  it('rejects listing templates without the scheduled_reports:read permission', async () => {
    await dataSource.query(
      'DELETE FROM company_user_permissions WHERE company_user_id = $1',
      [companyUserId],
    );

    await request(app.getHttpServer() as App)
      .get('/api/scheduled-reporting/templates')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects unauthenticated access to the report catalog', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/scheduled-reporting/report-definitions')
      .expect(401);
  });

  it('creates a report template against the real EMPLOYEE_DIRECTORY definition', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const response = await request(app.getHttpServer() as App)
      .post('/api/scheduled-reporting/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        reportDefinitionId,
        smtpConfigurationId,
        name: `E2E Employee Directory Template ${suffix}`,
        outputFormat: ReportOutputFormatEnum.CSV,
        isActive: true,
        attachReport: true,
        recipients: [
          {
            channel: ReportRecipientChannelEnum.TO,
            recipientType: ReportRecipientTypeEnum.EMAIL,
            emailAddress: 'recipient@example.com',
          },
        ],
      })
      .expect(201);

    templateId = response.body.id as number;
    expect(templateId).toBeDefined();
    expect(response.body.reportDefinitionId).toBe(reportDefinitionId);
  });

  it('queues a manual execution that persists as a real PENDING report_executions row', async () => {
    const createResponse = await request(app.getHttpServer() as App)
      .post('/api/scheduled-reporting/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        reportDefinitionId,
        smtpConfigurationId,
        name: `E2E Runnable Template ${Date.now()}`,
        outputFormat: ReportOutputFormatEnum.CSV,
        isActive: true,
        attachReport: true,
        recipients: [
          {
            channel: ReportRecipientChannelEnum.TO,
            recipientType: ReportRecipientTypeEnum.EMAIL,
            emailAddress: 'recipient@example.com',
          },
        ],
      })
      .expect(201);
    templateId = createResponse.body.id as number;

    const runResponse = await request(app.getHttpServer() as App)
      .post(`/api/scheduled-reporting/templates/${templateId}/run`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    executionId = runResponse.body.id as number;
    expect(executionId).toBeDefined();

    const [row] = await dataSource.query(
      'SELECT status, template_id, company_id FROM report_executions WHERE id = $1',
      [executionId],
    );
    expect(row.status).toBe('PENDING');
    expect(row.template_id).toBe(templateId);
    expect(row.company_id).toBe(companyId);
  });

  it('rejects running a template belonging to another company', async () => {
    const otherCompanySuffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const otherCompany = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Other Reporting Co ${otherCompanySuffix}`,
        slug: `e2e-other-reporting-${otherCompanySuffix}`,
        status: 'active',
      }),
    );

    try {
      const otherSmtp = await dataSource
        .getRepository(ReportSmtpConfiguration)
        .save(
          dataSource.getRepository(ReportSmtpConfiguration).create({
            companyId: otherCompany.id,
            name: `Other SMTP ${otherCompanySuffix}`,
            host: 'smtp.example.com',
            port: 587,
            securityType: ReportSmtpSecurityTypeEnum.STARTTLS,
            senderEmail: 'reports@example.com',
            senderName: 'Other Reports',
            isActive: true,
            isDefault: true,
            lastTestStatus: ReportSmtpTestStatusEnum.SUCCESS,
            lastTestedAt: new Date(),
          }),
        );

      const otherTemplateRepo = dataSource.getRepository(ReportTemplate);
      const otherTemplate = await otherTemplateRepo.save(
        otherTemplateRepo.create({
          companyId: otherCompany.id,
          reportDefinitionId,
          smtpConfigurationId: otherSmtp.id,
          name: `Other Company Template ${otherCompanySuffix}`,
          outputFormat: ReportOutputFormatEnum.CSV,
          isActive: true,
          attachReport: false,
        }),
      );

      await request(app.getHttpServer() as App)
        .post(`/api/scheduled-reporting/templates/${otherTemplate.id}/run`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(404);

      await dataSource.query('DELETE FROM report_templates WHERE id = $1', [
        otherTemplate.id,
      ]);
      await dataSource.query(
        'DELETE FROM report_smtp_configurations WHERE id = $1',
        [otherSmtp.id],
      );
    } finally {
      await dataSource.query('DELETE FROM companies WHERE id = $1', [
        otherCompany.id,
      ]);
    }
  });
});
