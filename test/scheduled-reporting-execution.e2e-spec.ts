process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../src/database/data-source';
import { PostgresAdvisoryLockService } from '../src/common/database/postgres-advisory-lock.service';
import { FilesService } from '../src/modules/files/files.service';
import { Company } from '../src/modules/companies/entities/company.entity';
import { CompanyUser } from '../src/modules/companies/entities/company-user.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../src/modules/hr/employees/enums/employment-status.enum';
import { AttendanceDailySummary } from '../src/modules/hr/attendance/processing/entities/attendance-daily-summary.entity';
import { ReportDefinition } from '../src/modules/scheduled-reporting/entities/report-definition.entity';
import { ReportExecution } from '../src/modules/scheduled-reporting/entities/report-execution.entity';
import { ReportSchedule } from '../src/modules/scheduled-reporting/entities/report-schedule.entity';
import { ReportTemplate } from '../src/modules/scheduled-reporting/entities/report-template.entity';
import { ReportScheduleTypeEnum } from '../src/modules/scheduled-reporting/enums/report-schedule-type.enum';
import { ReportOutputFormatEnum } from '../src/modules/scheduled-reporting/enums/report-output-format.enum';
import { ReportExecutionStatusEnum } from '../src/modules/scheduled-reporting/enums/report-execution-status.enum';
import { ReportEmailDeliveryStatusEnum } from '../src/modules/scheduled-reporting/enums/report-email-delivery-status.enum';
import { ReportScheduleDispatcherService } from '../src/modules/scheduled-reporting/services/report-schedule-dispatcher.service';
import { ReportExecutionWorkerService } from '../src/modules/scheduled-reporting/services/report-execution-worker.service';
import { ReportRegistryService } from '../src/modules/scheduled-reporting/services/report-registry.service';
import { AttendanceSummaryReportRunner } from '../src/modules/scheduled-reporting/services/runners/attendance-summary-report-runner.service';
import { EmployeeMasterReportRunner } from '../src/modules/scheduled-reporting/services/runners/employee-master-report-runner.service';
import { ReportSmtpConfiguration } from '../src/modules/scheduled-reporting/entities/report-smtp-configuration.entity';
import { ReportTemplateRecipient } from '../src/modules/scheduled-reporting/entities/report-template-recipient.entity';
import { ReportExecutionRecipient } from '../src/modules/scheduled-reporting/entities/report-execution-recipient.entity';
import { ReportExecutionAttempt } from '../src/modules/scheduled-reporting/entities/report-execution-attempt.entity';

/**
 * Runs the real schedule dispatcher and execution worker back-to-back
 * against a real Postgres database (hrms_test_db) to prove a due schedule
 * actually produces a queued execution, and that the worker actually
 * generates and stores a report file on disk from real employee rows --
 * not just in a mock's in-memory graph.
 */
describe('Scheduled reporting dispatcher + worker (e2e, real Postgres)', () => {
  let dataSource: DataSource;
  let filesService: FilesService;
  let companyId: number;
  let userId: number;
  let companyUserId: number;
  let employeeId: number;
  let templateId: number;
  let scheduleId: number;
  let reportDefinitionId: number;
  const createdExecutionIds: number[] = [];
  let storedFilePath: string | null = null;

  beforeAll(async () => {
    dataSource = AppDataSource.isInitialized
      ? AppDataSource
      : await AppDataSource.initialize();
    filesService = new FilesService({
      get: () => undefined,
    } as unknown as ConfigService);
  });

  afterAll(async () => {
    if (storedFilePath) {
      await filesService.removeManagedFile(storedFilePath);
    }
    for (const executionId of createdExecutionIds) {
      await dataSource.query(
        'DELETE FROM report_execution_attempts WHERE execution_id = $1',
        [executionId],
      );
      await dataSource.query(
        'DELETE FROM report_execution_recipients WHERE execution_id = $1',
        [executionId],
      );
      await dataSource.query('DELETE FROM report_executions WHERE id = $1', [
        executionId,
      ]);
    }
    if (scheduleId) {
      await dataSource.query('DELETE FROM report_schedules WHERE id = $1', [
        scheduleId,
      ]);
    }
    if (templateId) {
      await dataSource.query('DELETE FROM report_templates WHERE id = $1', [
        templateId,
      ]);
    }
    if (employeeId) {
      await dataSource.query('DELETE FROM employees WHERE id = $1', [
        employeeId,
      ]);
    }
    if (companyUserId) {
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
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Reporting Co ${suffix}`,
        slug: `e2e-reporting-${suffix}`,
        status: 'active',
      }),
    );
    companyId = company.id;

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-${suffix}`.slice(0, 20),
        first_name: 'Report',
        last_name: 'Subject',
        phone: `+2557${suffix}`.slice(0, 20),
        email: `report.subject.${suffix}@example.com`,
        password: 'not-a-real-hash',
        status: 'active',
        user_type: 'COMPANY_USER',
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
        employee_no: `EMP-${suffix}`.slice(0, 50),
        first_name: 'Report',
        last_name: 'Subject',
        gender: 'female',
        employment_status: EmploymentStatusEnum.ACTIVE,
      }),
    );
    employeeId = employee.id;

    const reportDefinition = await dataSource
      .getRepository(ReportDefinition)
      .findOneOrFail({ where: { reportCode: 'EMPLOYEE_DIRECTORY' } });
    reportDefinitionId = reportDefinition.id;

    const template = await dataSource.getRepository(ReportTemplate).save(
      dataSource.getRepository(ReportTemplate).create({
        companyId,
        reportDefinitionId,
        smtpConfigurationId: null,
        name: `E2E Employee Directory ${suffix}`.slice(0, 150),
        outputFormat: ReportOutputFormatEnum.CSV,
        filenamePattern: 'employee-directory-{{reportDate}}.csv',
        attachReport: true,
        isActive: true,
        reportFilters: {},
      }),
    );
    templateId = template.id;

    const schedule = await dataSource.getRepository(ReportSchedule).save(
      dataSource.getRepository(ReportSchedule).create({
        companyId,
        templateId,
        name: `E2E Daily Directory ${suffix}`.slice(0, 150),
        scheduleType: ReportScheduleTypeEnum.DAILY,
        isActive: true,
        nextRunAt: new Date(Date.now() - 60000),
        maxRetryAttempts: 3,
      }),
    );
    scheduleId = schedule.id;
  });

  it('creates a PENDING execution for a due schedule and only ever creates one per day', async () => {
    const dispatcher = new ReportScheduleDispatcherService(
      dataSource.getRepository(ReportSchedule),
      dataSource.getRepository(ReportTemplate),
      dataSource.getRepository(ReportExecution),
      new PostgresAdvisoryLockService(dataSource),
    );

    await dispatcher.dispatch();

    const executions = await dataSource.query(
      'SELECT id, status FROM report_executions WHERE schedule_id = $1',
      [scheduleId],
    );
    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe(ReportExecutionStatusEnum.PENDING);
    createdExecutionIds.push(executions[0].id);

    // Dispatching again the same day must not create a second execution.
    await dispatcher.dispatch();
    const executionsAfterSecondDispatch = await dataSource.query(
      'SELECT id FROM report_executions WHERE schedule_id = $1',
      [scheduleId],
    );
    expect(executionsAfterSecondDispatch).toHaveLength(1);
  });

  it('generates and privately stores the report file for a PENDING execution', async () => {
    const execution = await dataSource.getRepository(ReportExecution).save(
      dataSource.getRepository(ReportExecution).create({
        companyId,
        templateId,
        scheduleId,
        reportDefinitionId,
        smtpConfigurationId: null,
        source: 'MANUAL' as never,
        status: ReportExecutionStatusEnum.PENDING,
        emailDeliveryStatus: ReportEmailDeliveryStatusEnum.PENDING,
        idempotencyKey: `e2e-worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        reportDateFrom: new Date().toISOString().slice(0, 10),
        reportDateTo: new Date().toISOString().slice(0, 10),
        appliedFilters: {},
        executionMetadata: {
          requestedOutputFormat: ReportOutputFormatEnum.CSV,
        },
        maxRetryAttempts: 3,
      }),
    );
    createdExecutionIds.push(execution.id);

    const registry = new ReportRegistryService(
      new AttendanceSummaryReportRunner(
        dataSource.getRepository(AttendanceDailySummary),
      ),
      new EmployeeMasterReportRunner(dataSource.getRepository(Employee)),
    );

    const worker = new ReportExecutionWorkerService(
      dataSource.getRepository(ReportExecution),
      dataSource.getRepository(ReportTemplate),
      dataSource.getRepository(ReportDefinition),
      dataSource.getRepository(ReportSmtpConfiguration),
      dataSource.getRepository(ReportTemplateRecipient),
      dataSource.getRepository(ReportExecutionRecipient),
      dataSource.getRepository(ReportExecutionAttempt),
      new PostgresAdvisoryLockService(dataSource),
      registry,
      filesService,
    );

    await worker.dispatch();

    const [executionRow] = await dataSource.query(
      'SELECT status, generated_file_path, generated_filename, record_count, email_delivery_status FROM report_executions WHERE id = $1',
      [execution.id],
    );

    expect(executionRow.status).toBe(ReportExecutionStatusEnum.GENERATED);
    expect(executionRow.email_delivery_status).toBe(
      ReportEmailDeliveryStatusEnum.SKIPPED,
    );
    expect(executionRow.generated_file_path).toBeTruthy();
    expect(Number(executionRow.record_count)).toBeGreaterThanOrEqual(1);
    storedFilePath = executionRow.generated_file_path;

    const fileBuffer = await filesService.readManagedFile(storedFilePath);
    expect(fileBuffer).not.toBeNull();
    expect(fileBuffer!.toString('utf8')).toContain(
      (
        await dataSource
          .getRepository(Employee)
          .findOneByOrFail({ id: employeeId })
      ).employee_no,
    );
  });
});
