import ExcelJS from 'exceljs';
import { DataSource, Repository } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { AttendanceDailySummary } from '../../hr/attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceReportRow } from '../../hr/attendance/processing/reports/attendance-report.types';
import {
  buildEmployeeFullName,
  formatAttendanceTime,
  resolveReportLabel,
  toExcelDate,
  toExcelTime,
} from '../../hr/attendance/processing/reports/attendance-report.utils';
import { ReportAttemptStatusEnum } from '../enums/report-attempt-status.enum';
import { ReportEmailDeliveryStatusEnum } from '../enums/report-email-delivery-status.enum';
import { ReportExecutionAttemptPhaseEnum } from '../enums/report-execution-attempt-phase.enum';
import { ReportExecutionSourceEnum } from '../enums/report-execution-source.enum';
import { ReportExecutionStatusEnum } from '../enums/report-execution-status.enum';
import { ReportOutputFormatEnum } from '../enums/report-output-format.enum';
import { ReportRecipientChannelEnum } from '../enums/report-recipient-channel.enum';
import { ReportRecipientTypeEnum } from '../enums/report-recipient-type.enum';
import { ReportScheduleMisfireHandlingEnum } from '../enums/report-schedule-misfire-handling.enum';
import { ReportScheduleTypeEnum } from '../enums/report-schedule-type.enum';
import { ReportSmtpSecurityTypeEnum } from '../enums/report-smtp-security-type.enum';
import { ReportSmtpTestStatusEnum } from '../enums/report-smtp-test-status.enum';
import { ReportTemplateDateRangeStrategyEnum } from '../enums/report-template-date-range-strategy.enum';
import { ReportDefinition } from '../entities/report-definition.entity';
import { ReportExecutionAttempt } from '../entities/report-execution-attempt.entity';
import { ReportExecutionRecipient } from '../entities/report-execution-recipient.entity';
import { ReportExecution } from '../entities/report-execution.entity';
import { ReportSchedule } from '../entities/report-schedule.entity';
import { ReportSmtpConfiguration } from '../entities/report-smtp-configuration.entity';
import { ReportTemplateRecipient } from '../entities/report-template-recipient.entity';
import { ReportTemplate } from '../entities/report-template.entity';
import {
  decryptReportSmtpSecret,
  encryptReportSmtpSecret,
} from '../utils/report-smtp-secret.util';

export interface SetupDailyAttendanceReportInput {
  companyId: number;
  recipientEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  senderEmail: string;
  senderName: string;
  appName: string;
  timezone?: string;
  templateName?: string;
  scheduleName?: string;
  executionTime?: string;
  requestedReportDate?: string;
  fallbackToLatestAvailable?: boolean;
}

type ReportAttachment = {
  filename: string;
  mimeType: string;
  content: Buffer;
  recordCount: number;
  reportDate: string;
};

type ReportMailTransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth?: {
    user: string;
    pass: string;
  };
};

type ReportMailSendOptions = {
  from: string;
  to: string;
  subject: string;
  html: string;
  attachments: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
};

type ReportMailSendResult = {
  accepted: string[];
  rejected: string[];
  response: string;
  messageId: string;
};

type ReportMailTransporter = {
  sendMail(options: ReportMailSendOptions): Promise<ReportMailSendResult>;
};

type NodemailerModule = {
  createTransport(options: ReportMailTransportOptions): ReportMailTransporter;
};

async function loadNodemailerModule(): Promise<NodemailerModule> {
  return (await import('nodemailer')) as unknown as NodemailerModule;
}

export class DailyAttendanceReportRunner {
  private readonly companyRepository: Repository<Company>;
  private readonly attendanceDailySummaryRepository: Repository<AttendanceDailySummary>;
  private readonly reportDefinitionRepository: Repository<ReportDefinition>;
  private readonly reportSmtpConfigurationRepository: Repository<ReportSmtpConfiguration>;
  private readonly reportTemplateRepository: Repository<ReportTemplate>;
  private readonly reportTemplateRecipientRepository: Repository<ReportTemplateRecipient>;
  private readonly reportScheduleRepository: Repository<ReportSchedule>;
  private readonly reportExecutionRepository: Repository<ReportExecution>;
  private readonly reportExecutionRecipientRepository: Repository<ReportExecutionRecipient>;
  private readonly reportExecutionAttemptRepository: Repository<ReportExecutionAttempt>;

  constructor(private readonly dataSource: DataSource) {
    this.companyRepository = dataSource.getRepository(Company);
    this.attendanceDailySummaryRepository = dataSource.getRepository(
      AttendanceDailySummary,
    );
    this.reportDefinitionRepository =
      dataSource.getRepository(ReportDefinition);
    this.reportSmtpConfigurationRepository = dataSource.getRepository(
      ReportSmtpConfiguration,
    );
    this.reportTemplateRepository = dataSource.getRepository(ReportTemplate);
    this.reportTemplateRecipientRepository = dataSource.getRepository(
      ReportTemplateRecipient,
    );
    this.reportScheduleRepository = dataSource.getRepository(ReportSchedule);
    this.reportExecutionRepository = dataSource.getRepository(ReportExecution);
    this.reportExecutionRecipientRepository = dataSource.getRepository(
      ReportExecutionRecipient,
    );
    this.reportExecutionAttemptRepository = dataSource.getRepository(
      ReportExecutionAttempt,
    );
  }

  async setupTemplateAndSend(input: SetupDailyAttendanceReportInput) {
    const timezone = input.timezone ?? 'Africa/Dar_es_Salaam';
    const templateName = input.templateName ?? 'Daily Attendance Report';
    const scheduleName =
      input.scheduleName ?? 'Daily Attendance Report Schedule';
    const executionTime = input.executionTime ?? '08:00:00';
    const fallbackToLatestAvailable = input.fallbackToLatestAvailable ?? true;

    const company = await this.companyRepository.findOne({
      where: { id: input.companyId },
    });

    if (!company) {
      throw new Error(`Company ${input.companyId} was not found.`);
    }

    const reportDefinition = await this.reportDefinitionRepository.findOne({
      where: {
        reportCode: 'ATTENDANCE_SUMMARY',
        isActive: true,
      },
    });

    if (!reportDefinition) {
      throw new Error('ATTENDANCE_SUMMARY report definition was not found.');
    }

    const smtpConfiguration = await this.upsertSmtpConfiguration({
      companyId: company.id,
      name: 'Gmail Scheduled Reports',
      host: input.smtpHost,
      port: input.smtpPort,
      smtpSecure: input.smtpSecure,
      username: input.smtpUser,
      password: input.smtpPass,
      senderEmail: input.senderEmail,
      senderName: input.senderName,
    });

    const template = await this.upsertTemplate({
      companyId: company.id,
      templateName,
      reportDefinitionId: reportDefinition.id,
      smtpConfigurationId: smtpConfiguration.id,
      appName: input.appName,
      recipientEmail: input.recipientEmail,
    });

    const templateRecipient = await this.upsertTemplateRecipient({
      companyId: company.id,
      templateId: template.id,
      recipientEmail: input.recipientEmail,
      displayName: input.senderName,
    });
    const recipientEmail = templateRecipient.emailAddress;

    if (!recipientEmail) {
      throw new Error('Template recipient email is empty.');
    }

    const schedule = await this.upsertSchedule({
      companyId: company.id,
      templateId: template.id,
      scheduleName,
      executionTime,
      timezone,
    });

    const requestedReportDate =
      input.requestedReportDate ?? this.getPreviousDateInTimezone(timezone);
    const resolvedReportDate = await this.resolveReportDate({
      companyId: company.id,
      requestedReportDate,
      fallbackToLatestAvailable,
    });

    const execution = await this.reportExecutionRepository.save(
      this.reportExecutionRepository.create({
        companyId: company.id,
        templateId: template.id,
        scheduleId: schedule.id,
        reportDefinitionId: reportDefinition.id,
        smtpConfigurationId: smtpConfiguration.id,
        source: ReportExecutionSourceEnum.MANUAL,
        status: ReportExecutionStatusEnum.GENERATING,
        emailDeliveryStatus: ReportEmailDeliveryStatusEnum.PENDING,
        idempotencyKey: `manual-daily-attendance-${company.id}-${resolvedReportDate}-${Date.now()}`,
        startedAt: new Date(),
        reportDateFrom: resolvedReportDate,
        reportDateTo: resolvedReportDate,
        appliedFilters: {
          fromDate: resolvedReportDate,
          toDate: resolvedReportDate,
        },
        executionMetadata: {
          requestedReportDate,
          timezone,
          fallbackToLatestAvailable,
        },
        maxRetryAttempts: schedule.maxRetryAttempts,
      }),
    );

    await this.reportExecutionRecipientRepository.save(
      this.reportExecutionRecipientRepository.create({
        executionId: execution.id,
        channel: ReportRecipientChannelEnum.TO,
        sourceType: ReportRecipientTypeEnum.EMAIL,
        emailAddress: recipientEmail,
        displayName: templateRecipient.displayName,
        sourceLabel: templateRecipient.targetKey,
        deliveryStatus: ReportEmailDeliveryStatusEnum.PENDING,
      }),
    );

    try {
      const attachment = await this.buildDailyAttendanceAttachment({
        companyId: company.id,
        companyName: company.name,
        reportDate: resolvedReportDate,
        outputFormat: template.outputFormat ?? ReportOutputFormatEnum.XLSX,
        filenamePattern:
          template.filenamePattern ?? 'daily-attendance-{{reportDate}}.xlsx',
      });

      await this.reportExecutionAttemptRepository.save(
        this.reportExecutionAttemptRepository.create({
          executionId: execution.id,
          attemptNumber: 1,
          phase: ReportExecutionAttemptPhaseEnum.GENERATION,
          status: ReportAttemptStatusEnum.SUCCESS,
          startedAt: execution.startedAt,
          completedAt: new Date(),
          metadata: {
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            recordCount: attachment.recordCount,
            reportDate: attachment.reportDate,
          },
        }),
      );

      await this.reportExecutionRepository.update(execution.id, {
        status: ReportExecutionStatusEnum.SENDING,
        generatedFilename: attachment.filename,
        generatedFileMimeType: attachment.mimeType,
        generatedFileSize: String(attachment.content.byteLength),
        recordCount: attachment.recordCount,
      });

      const subject = this.renderTemplateString(
        template.emailSubjectTemplate ??
          'Daily Attendance Report - {{reportDate}}',
        {
          appName: input.appName,
          companyName: company.name,
          reportDate: attachment.reportDate,
          recordCount: String(attachment.recordCount),
        },
      );
      const html = this.renderTemplateString(
        template.emailBodyTemplate ??
          [
            '<p>Hello,</p>',
            '<p>Please find attached the daily attendance report for <strong>{{reportDate}}</strong>.</p>',
            '<p>Company: {{companyName}}<br/>Records: {{recordCount}}</p>',
            '<p>Regards,<br/>{{appName}}</p>',
          ].join(''),
        {
          appName: input.appName,
          companyName: company.name,
          reportDate: attachment.reportDate,
          recordCount: String(attachment.recordCount),
        },
      );

      const smtpPassword = decryptReportSmtpSecret(
        smtpConfiguration.encryptedPassword,
      );

      if (!smtpPassword) {
        throw new Error('Saved SMTP password is empty.');
      }

      const nodemailerModule = await loadNodemailerModule();
      const transporter = nodemailerModule.createTransport({
        host: smtpConfiguration.host,
        port: smtpConfiguration.port,
        secure:
          smtpConfiguration.securityType === ReportSmtpSecurityTypeEnum.SSL_TLS,
        requireTLS:
          smtpConfiguration.securityType ===
          ReportSmtpSecurityTypeEnum.STARTTLS,
        auth: smtpConfiguration.username
          ? {
              user: smtpConfiguration.username,
              pass: smtpPassword,
            }
          : undefined,
      });

      const mailResult = await transporter.sendMail({
        from: `"${smtpConfiguration.senderName || input.appName}" <${smtpConfiguration.senderEmail}>`,
        to: recipientEmail,
        subject,
        html,
        attachments: [
          {
            filename: attachment.filename,
            content: attachment.content,
            contentType: attachment.mimeType,
          },
        ],
      });

      await this.reportExecutionAttemptRepository.save(
        this.reportExecutionAttemptRepository.create({
          executionId: execution.id,
          attemptNumber: 1,
          phase: ReportExecutionAttemptPhaseEnum.EMAIL_DELIVERY,
          status: ReportAttemptStatusEnum.SUCCESS,
          startedAt: new Date(),
          completedAt: new Date(),
          metadata: {
            accepted: mailResult.accepted,
            rejected: mailResult.rejected,
            response: mailResult.response,
            messageId: mailResult.messageId,
          },
        }),
      );

      await this.reportExecutionRecipientRepository.update(
        {
          executionId: execution.id,
          emailAddress: recipientEmail,
        },
        {
          deliveryStatus: ReportEmailDeliveryStatusEnum.SENT,
          errorMessage: null,
        },
      );

      await this.reportExecutionRepository.update(execution.id, {
        status: ReportExecutionStatusEnum.SENT,
        emailDeliveryStatus: ReportEmailDeliveryStatusEnum.SENT,
        completedAt: new Date(),
        errorMessage: null,
        technicalDetails: mailResult.response,
        executionMetadata: {
          requestedReportDate,
          timezone,
          fallbackToLatestAvailable,
          actualReportDate: attachment.reportDate,
          messageId: mailResult.messageId,
        },
      });

      return {
        companyId: company.id,
        companyName: company.name,
        templateId: template.id,
        scheduleId: schedule.id,
        smtpConfigurationId: smtpConfiguration.id,
        executionId: execution.id,
        recipientEmail,
        requestedReportDate,
        actualReportDate: attachment.reportDate,
        recordCount: attachment.recordCount,
        filename: attachment.filename,
        mailResponse: mailResult.response,
        messageId: mailResult.messageId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown report delivery error';

      await this.reportExecutionAttemptRepository.save(
        this.reportExecutionAttemptRepository.create({
          executionId: execution.id,
          attemptNumber: 1,
          phase: ReportExecutionAttemptPhaseEnum.EMAIL_DELIVERY,
          status: ReportAttemptStatusEnum.FAILED,
          startedAt: new Date(),
          completedAt: new Date(),
          errorMessage,
          technicalDetails:
            error instanceof Error
              ? (error.stack ?? error.message)
              : errorMessage,
        }),
      );

      await this.reportExecutionRecipientRepository.update(
        {
          executionId: execution.id,
          emailAddress: recipientEmail,
        },
        {
          deliveryStatus: ReportEmailDeliveryStatusEnum.FAILED,
          errorMessage,
        },
      );

      await this.reportExecutionRepository.update(execution.id, {
        status: ReportExecutionStatusEnum.FAILED,
        emailDeliveryStatus: ReportEmailDeliveryStatusEnum.FAILED,
        completedAt: new Date(),
        errorMessage,
        technicalDetails:
          error instanceof Error
            ? (error.stack ?? error.message)
            : errorMessage,
      });

      throw error;
    }
  }

  private async upsertSmtpConfiguration(input: {
    companyId: number;
    name: string;
    host: string;
    port: number;
    smtpSecure: boolean;
    username: string;
    password: string;
    senderEmail: string;
    senderName: string;
  }) {
    const existing = await this.reportSmtpConfigurationRepository.findOne({
      where: {
        companyId: input.companyId,
        name: input.name,
      },
    });

    const entity = existing ?? this.reportSmtpConfigurationRepository.create();
    entity.companyId = input.companyId;
    entity.name = input.name;
    entity.host = input.host;
    entity.port = input.port;
    entity.securityType = input.smtpSecure
      ? ReportSmtpSecurityTypeEnum.SSL_TLS
      : ReportSmtpSecurityTypeEnum.STARTTLS;
    entity.username = input.username;
    entity.encryptedPassword = encryptReportSmtpSecret(input.password);
    entity.senderEmail = input.senderEmail;
    entity.senderName = input.senderName;
    entity.replyToEmail = input.senderEmail;
    entity.connectionTimeoutMs = 10000;
    entity.isActive = true;
    entity.isDefault = true;
    entity.lastTestStatus = ReportSmtpTestStatusEnum.SUCCESS;
    entity.lastTestedAt = new Date();
    entity.lastTestError = null;

    const saved = await this.reportSmtpConfigurationRepository.save(entity);

    await this.reportSmtpConfigurationRepository
      .createQueryBuilder()
      .update(ReportSmtpConfiguration)
      .set({ isDefault: false })
      .where('company_id = :companyId', { companyId: input.companyId })
      .andWhere('id <> :id', { id: saved.id })
      .execute();

    return saved;
  }

  private async upsertTemplate(input: {
    companyId: number;
    templateName: string;
    reportDefinitionId: number;
    smtpConfigurationId: number;
    appName: string;
    recipientEmail: string;
  }) {
    const existing = await this.reportTemplateRepository.findOne({
      where: {
        companyId: input.companyId,
        name: input.templateName,
      },
    });

    const entity = existing ?? this.reportTemplateRepository.create();
    entity.companyId = input.companyId;
    entity.reportDefinitionId = input.reportDefinitionId;
    entity.smtpConfigurationId = input.smtpConfigurationId;
    entity.name = input.templateName;
    entity.description =
      'Daily attendance email template for sending the prior business day attendance export.';
    entity.outputFormat = ReportOutputFormatEnum.XLSX;
    entity.filenamePattern = 'daily-attendance-{{reportDate}}.xlsx';
    entity.emailSubjectTemplate = 'Daily Attendance Report - {{reportDate}}';
    entity.emailBodyTemplate = [
      '<p>Hello,</p>',
      '<p>Please find attached the daily attendance report for <strong>{{reportDate}}</strong>.</p>',
      '<p>Company: {{companyName}}<br/>Records: {{recordCount}}</p>',
      '<p>Regards,<br/>{{appName}}</p>',
    ].join('');
    entity.dateRangeStrategy = ReportTemplateDateRangeStrategyEnum.PREVIOUS_DAY;
    entity.dateRangeConfig = {
      relativeTo: 'schedule_run_date',
      offsetDays: -1,
    };
    entity.reportFilters = {};
    entity.attachReport = true;
    entity.isActive = true;

    return this.reportTemplateRepository.save(entity);
  }

  private async upsertTemplateRecipient(input: {
    companyId: number;
    templateId: number;
    recipientEmail: string;
    displayName: string;
  }) {
    const targetKey = `email:${input.recipientEmail.toLowerCase()}`;
    const existing = await this.reportTemplateRecipientRepository.findOne({
      where: {
        templateId: input.templateId,
        targetKey,
      },
    });

    const entity = existing ?? this.reportTemplateRecipientRepository.create();
    entity.companyId = input.companyId;
    entity.templateId = input.templateId;
    entity.channel = ReportRecipientChannelEnum.TO;
    entity.recipientType = ReportRecipientTypeEnum.EMAIL;
    entity.targetKey = targetKey;
    entity.emailAddress = input.recipientEmail;
    entity.displayName = input.displayName;

    return this.reportTemplateRecipientRepository.save(entity);
  }

  private async upsertSchedule(input: {
    companyId: number;
    templateId: number;
    scheduleName: string;
    executionTime: string;
    timezone: string;
  }) {
    const existing = await this.reportScheduleRepository.findOne({
      where: {
        companyId: input.companyId,
        name: input.scheduleName,
      },
    });

    const entity = existing ?? this.reportScheduleRepository.create();
    entity.companyId = input.companyId;
    entity.templateId = input.templateId;
    entity.name = input.scheduleName;
    entity.scheduleType = ReportScheduleTypeEnum.DAILY;
    entity.executionTime = input.executionTime;
    entity.timezone = input.timezone;
    entity.misfireHandling = ReportScheduleMisfireHandlingEnum.SKIP;
    entity.maxRetryAttempts = 3;
    entity.isActive = true;
    entity.pausedAt = null;
    entity.nextRunAt = this.computeNextRunAt(
      input.executionTime,
      input.timezone,
    );

    return this.reportScheduleRepository.save(entity);
  }

  private async resolveReportDate(input: {
    companyId: number;
    requestedReportDate: string;
    fallbackToLatestAvailable: boolean;
  }) {
    const requestedCount = await this.attendanceDailySummaryRepository
      .createQueryBuilder('summary')
      .where('summary.company_id = :companyId', { companyId: input.companyId })
      .andWhere('summary.attendance_date = :reportDate', {
        reportDate: input.requestedReportDate,
      })
      .getCount();

    if (requestedCount > 0) {
      return input.requestedReportDate;
    }

    if (!input.fallbackToLatestAvailable) {
      return input.requestedReportDate;
    }

    const latestRow = await this.attendanceDailySummaryRepository
      .createQueryBuilder('summary')
      .select('MAX(summary.attendance_date)::text', 'latestDate')
      .where('summary.company_id = :companyId', { companyId: input.companyId })
      .getRawOne<{ latestDate: string | null }>();

    if (!latestRow?.latestDate) {
      return input.requestedReportDate;
    }

    return latestRow.latestDate;
  }

  private async buildDailyAttendanceAttachment(input: {
    companyId: number;
    companyName: string;
    reportDate: string;
    outputFormat: ReportOutputFormatEnum;
    filenamePattern: string;
  }): Promise<ReportAttachment> {
    const rows = await this.fetchAttendanceRows(
      input.companyId,
      input.reportDate,
    );
    const outputFormat = input.outputFormat ?? ReportOutputFormatEnum.XLSX;
    const extension = outputFormat.toLowerCase();
    const filename = this.renderTemplateString(input.filenamePattern, {
      reportDate: input.reportDate,
    }).replace(/\.(xlsx|csv|pdf)$/i, `.${extension}`);

    if (outputFormat === ReportOutputFormatEnum.CSV) {
      const content = this.buildCsvBuffer(rows);
      return {
        filename,
        mimeType: 'text/csv',
        content,
        recordCount: rows.length,
        reportDate: input.reportDate,
      };
    }

    const content = await this.buildXlsxBuffer(rows);
    return {
      filename,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content,
      recordCount: rows.length,
      reportDate: input.reportDate,
    };
  }

  private async fetchAttendanceRows(companyId: number, reportDate: string) {
    const rows = await this.attendanceDailySummaryRepository
      .createQueryBuilder('summary')
      .innerJoin('summary.employee', 'employee')
      .leftJoin('summary.shift', 'shift')
      .leftJoin('summary.timetable', 'timetable')
      .select('summary.id', 'summaryId')
      .addSelect('summary.attendance_date', 'attendanceDate')
      .addSelect('summary.attendance_status', 'attendanceStatus')
      .addSelect('summary.check_in_at', 'checkInAt')
      .addSelect('summary.check_out_at', 'checkOutAt')
      .addSelect('summary.timezone', 'timezone')
      .addSelect('employee.employee_no', 'employeeNumber')
      .addSelect('employee.first_name', 'employeeFirstName')
      .addSelect('employee.middle_name', 'employeeMiddleName')
      .addSelect('employee.last_name', 'employeeLastName')
      .addSelect('shift.name', 'shiftName')
      .addSelect('shift.code', 'shiftCode')
      .addSelect('timetable.name', 'timetableName')
      .addSelect('timetable.code', 'timetableCode')
      .where('summary.company_id = :companyId', { companyId })
      .andWhere('summary.attendance_date = :reportDate', { reportDate })
      .orderBy('employee.employee_no', 'ASC')
      .getRawMany<{
        summaryId: number | string;
        attendanceDate: string;
        attendanceStatus: string;
        checkInAt: Date | null;
        checkOutAt: Date | null;
        timezone: string;
        employeeNumber: string;
        employeeFirstName: string;
        employeeMiddleName: string | null;
        employeeLastName: string;
        shiftName: string | null;
        shiftCode: string | null;
        timetableName: string | null;
        timetableCode: string | null;
      }>();

    return rows.map(
      (row): AttendanceReportRow => ({
        summaryId: Number(row.summaryId),
        employeeName:
          buildEmployeeFullName([
            row.employeeFirstName,
            row.employeeMiddleName,
            row.employeeLastName,
          ]) || row.employeeNumber,
        employeeNumber: row.employeeNumber,
        attendanceDate: row.attendanceDate,
        shiftName: resolveReportLabel(row.shiftName, row.shiftCode),
        timetableName: resolveReportLabel(row.timetableName, row.timetableCode),
        attendanceStatus: row.attendanceStatus,
        checkInAt: row.checkInAt ? new Date(row.checkInAt) : null,
        checkOutAt: row.checkOutAt ? new Date(row.checkOutAt) : null,
        timezone: row.timezone,
      }),
    );
  }

  private async buildXlsxBuffer(rows: AttendanceReportRow[]) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Report', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    worksheet.columns = [
      { header: 'Employee Name', key: 'employeeName', width: 28 },
      { header: 'Employee Number', key: 'employeeNumber', width: 18 },
      { header: 'Attendance Date', key: 'attendanceDate', width: 16 },
      { header: 'Shift', key: 'shiftName', width: 24 },
      { header: 'Timetable', key: 'timetableName', width: 24 },
      { header: 'Attendance Status', key: 'attendanceStatus', width: 18 },
      { header: 'Check-In Time', key: 'checkInTime', width: 16 },
      { header: 'Check-Out Time', key: 'checkOutTime', width: 16 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle' };

    for (const row of rows) {
      const excelRow = worksheet.addRow({
        employeeName: row.employeeName,
        employeeNumber: row.employeeNumber,
        attendanceDate: toExcelDate(row.attendanceDate),
        shiftName: row.shiftName,
        timetableName: row.timetableName,
        attendanceStatus: row.attendanceStatus,
        checkInTime:
          toExcelTime(row.checkInAt, row.timezone) ??
          formatAttendanceTime(row.checkInAt, row.timezone),
        checkOutTime:
          toExcelTime(row.checkOutAt, row.timezone) ??
          formatAttendanceTime(row.checkOutAt, row.timezone),
      });

      excelRow.getCell('attendanceDate').numFmt = 'yyyy-mm-dd';

      if (row.checkInAt) {
        excelRow.getCell('checkInTime').numFmt = 'hh:mm:ss';
      }

      if (row.checkOutAt) {
        excelRow.getCell('checkOutTime').numFmt = 'hh:mm:ss';
      }
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private buildCsvBuffer(rows: AttendanceReportRow[]) {
    const lines = [
      [
        'Employee Name',
        'Employee Number',
        'Attendance Date',
        'Shift',
        'Timetable',
        'Attendance Status',
        'Check-In Time',
        'Check-Out Time',
      ].join(','),
    ];

    for (const row of rows) {
      lines.push(
        [
          this.escapeCsvCell(row.employeeName),
          this.escapeCsvCell(row.employeeNumber),
          this.escapeCsvCell(row.attendanceDate),
          this.escapeCsvCell(row.shiftName),
          this.escapeCsvCell(row.timetableName),
          this.escapeCsvCell(row.attendanceStatus),
          this.escapeCsvCell(formatAttendanceTime(row.checkInAt, row.timezone)),
          this.escapeCsvCell(
            formatAttendanceTime(row.checkOutAt, row.timezone),
          ),
        ].join(','),
      );
    }

    return Buffer.from(lines.join('\r\n'), 'utf8');
  }

  private escapeCsvCell(value: string) {
    if (!/[",\r\n]/.test(value)) {
      return value;
    }

    return `"${value.replace(/"/g, '""')}"`;
  }

  private renderTemplateString(
    template: string,
    values: Record<string, string>,
  ) {
    return template.replace(
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
      (_: string, key: string) => {
        return values[key] ?? '';
      },
    );
  }

  private getPreviousDateInTimezone(timezone: string) {
    const today = this.formatDateInTimezone(new Date(), timezone);
    return this.shiftDate(today, -1);
  }

  private formatDateInTimezone(date: Date, timezone: string) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private shiftDate(date: string, days: number) {
    const utcDate = new Date(`${date}T00:00:00.000Z`);
    utcDate.setUTCDate(utcDate.getUTCDate() + days);
    return utcDate.toISOString().slice(0, 10);
  }

  private computeNextRunAt(executionTime: string, timezone: string) {
    const nextDate = this.shiftDate(
      this.formatDateInTimezone(new Date(), timezone),
      1,
    );
    const [hour, minute, second] = executionTime
      .split(':')
      .map((token) => Number(token));
    const offsetMinutes = timezone === 'Africa/Dar_es_Salaam' ? 180 : 0;

    return new Date(
      Date.UTC(
        Number(nextDate.slice(0, 4)),
        Number(nextDate.slice(5, 7)) - 1,
        Number(nextDate.slice(8, 10)),
        (Number.isFinite(hour) ? hour : 0) - Math.trunc(offsetMinutes / 60),
        Number.isFinite(minute) ? minute : 0,
        Number.isFinite(second) ? second : 0,
      ),
    );
  }
}
