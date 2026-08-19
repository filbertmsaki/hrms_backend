import { EntityManager, Repository } from 'typeorm';
import { ReportDefinition } from '../entities/report-definition.entity';
import { ReportSchedule } from '../entities/report-schedule.entity';
import { ReportTemplate } from '../entities/report-template.entity';
import { ReportTemplateRecipient } from '../entities/report-template-recipient.entity';
import { ReportOutputFormatEnum } from '../enums/report-output-format.enum';
import { ReportRecipientChannelEnum } from '../enums/report-recipient-channel.enum';
import { ReportRecipientTypeEnum } from '../enums/report-recipient-type.enum';
import { ReportScheduleMisfireHandlingEnum } from '../enums/report-schedule-misfire-handling.enum';
import { ReportScheduleTypeEnum } from '../enums/report-schedule-type.enum';
import { ReportTemplateDateRangeStrategyEnum } from '../enums/report-template-date-range-strategy.enum';
import { computeNextScheduleRunAt } from './report-schedule-next-run.util';

export const DEFAULT_ATTENDANCE_REPORT_TIMEZONE = 'Africa/Dar_es_Salaam';

export type ProvisionDefaultAttendanceReportsConfig = {
  morningEnabled: boolean;
  morningTime: string;
  dailyEnabled: boolean;
  dailyTime: string;
  toRecipients: string[];
  ccRecipients: string[];
  bccRecipients: string[];
};

/**
 * Provisions (or re-syncs) the two default "system" attendance reports -
 * Morning Attendance Report and End of Day Attendance Report - for a single
 * company. Used both by the one-off database seeder (for existing companies)
 * and at company-creation time (for every company created afterwards), so
 * these two reports are always present out of the box rather than something
 * an admin has to remember to set up.
 *
 * Idempotent: upserts by natural key (companyId + name / templateId +
 * targetKey), safe to call repeatedly (e.g. re-running the seeder, or if a
 * company signup retries).
 *
 * Does NOT assign an smtpConfigurationId - SMTP is per-company and must be
 * configured by an admin via POST /scheduled-reporting/smtp-configurations
 * before email delivery for these reports will actually fire; until then the
 * execution worker safely skips email delivery rather than failing.
 */
export async function provisionDefaultAttendanceReportsForCompany(
  manager: EntityManager,
  companyId: number,
  config: ProvisionDefaultAttendanceReportsConfig,
): Promise<void> {
  const reportDefinitionRepository = manager.getRepository(ReportDefinition);
  const reportTemplateRepository = manager.getRepository(ReportTemplate);
  const reportTemplateRecipientRepository = manager.getRepository(
    ReportTemplateRecipient,
  );
  const reportScheduleRepository = manager.getRepository(ReportSchedule);

  const morningDefinition = await reportDefinitionRepository.findOne({
    where: { reportCode: 'MORNING_ATTENDANCE' },
  });
  const endOfDayDefinition = await reportDefinitionRepository.findOne({
    where: { reportCode: 'END_OF_DAY_ATTENDANCE' },
  });

  if (!morningDefinition || !endOfDayDefinition) {
    // Report definitions are seeded via migration/seeder; if they are not
    // present yet (e.g. a brand new environment mid-migration), skip
    // silently rather than failing company creation.
    return;
  }

  const morningTemplate = await upsertTemplate(reportTemplateRepository, {
    companyId,
    name: 'Morning Attendance Report',
    reportDefinitionId: morningDefinition.id,
    isActive: config.morningEnabled,
    filenamePattern: 'morning-attendance-{{reportDate}}.xlsx',
    emailSubjectTemplate: 'Morning Attendance Report - {{reportDate}}',
    emailBodyTemplate:
      '<p>Hello,</p><p>Please find attached the morning attendance snapshot for <strong>{{reportDate}}</strong>.</p>',
  });
  await upsertRecipients(
    reportTemplateRecipientRepository,
    companyId,
    morningTemplate.id,
    config,
  );
  await upsertSchedule(reportScheduleRepository, {
    companyId,
    templateId: morningTemplate.id,
    name: 'Morning Attendance Report Schedule',
    executionTime: normalizeTime(config.morningTime),
    isActive: config.morningEnabled,
  });

  const eodTemplate = await upsertTemplate(reportTemplateRepository, {
    companyId,
    name: 'End of Day Attendance Report',
    reportDefinitionId: endOfDayDefinition.id,
    isActive: config.dailyEnabled,
    filenamePattern: 'end-of-day-attendance-{{reportDate}}.xlsx',
    emailSubjectTemplate: 'End of Day Attendance Report - {{reportDate}}',
    emailBodyTemplate:
      '<p>Hello,</p><p>Please find attached the end-of-day attendance summary for <strong>{{reportDate}}</strong>.</p>',
  });
  await upsertRecipients(
    reportTemplateRecipientRepository,
    companyId,
    eodTemplate.id,
    config,
  );
  await upsertSchedule(reportScheduleRepository, {
    companyId,
    templateId: eodTemplate.id,
    name: 'End of Day Attendance Report Schedule',
    executionTime: normalizeTime(config.dailyTime),
    isActive: config.dailyEnabled,
  });
}

export function resolveDefaultAttendanceReportsConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ProvisionDefaultAttendanceReportsConfig {
  return {
    morningEnabled: parseBool(env.ATTENDANCE_MORNING_REPORT_ENABLED, true),
    morningTime: (env.ATTENDANCE_MORNING_REPORT_TIME ?? '09:00').trim(),
    dailyEnabled: parseBool(env.ATTENDANCE_DAILY_REPORT_ENABLED, true),
    dailyTime: (env.ATTENDANCE_DAILY_REPORT_TIME ?? '18:00').trim(),
    toRecipients: parseCsv(env.ATTENDANCE_REPORT_TO),
    ccRecipients: parseCsv(env.ATTENDANCE_REPORT_CC),
    bccRecipients: parseCsv(env.ATTENDANCE_REPORT_BCC),
  };
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  return value.trim().toLowerCase() === 'true';
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time;
}

async function upsertTemplate(
  repository: Repository<ReportTemplate>,
  input: {
    companyId: number;
    name: string;
    reportDefinitionId: number;
    isActive: boolean;
    filenamePattern: string;
    emailSubjectTemplate: string;
    emailBodyTemplate: string;
  },
): Promise<ReportTemplate> {
  const existing = await repository.findOne({
    where: { companyId: input.companyId, name: input.name },
  });

  const entity = existing ?? repository.create();
  entity.companyId = input.companyId;
  entity.reportDefinitionId = input.reportDefinitionId;
  entity.smtpConfigurationId = entity.smtpConfigurationId ?? null;
  entity.name = input.name;
  entity.description = `${input.name} (auto-provisioned default system report).`;
  entity.outputFormat = ReportOutputFormatEnum.XLSX;
  entity.filenamePattern = input.filenamePattern;
  entity.emailSubjectTemplate = input.emailSubjectTemplate;
  entity.emailBodyTemplate = input.emailBodyTemplate;
  entity.dateRangeStrategy = ReportTemplateDateRangeStrategyEnum.CURRENT_DAY;
  entity.dateRangeConfig = {
    relativeTo: 'schedule_run_date',
    offsetDays: 0,
  };
  entity.reportFilters = entity.reportFilters ?? {};
  entity.attachReport = true;
  entity.isActive = input.isActive;

  return repository.save(entity);
}

async function upsertRecipients(
  repository: Repository<ReportTemplateRecipient>,
  companyId: number,
  templateId: number,
  config: ProvisionDefaultAttendanceReportsConfig,
): Promise<void> {
  const channelGroups: Array<[ReportRecipientChannelEnum, string[]]> = [
    [ReportRecipientChannelEnum.TO, config.toRecipients],
    [ReportRecipientChannelEnum.CC, config.ccRecipients],
    [ReportRecipientChannelEnum.BCC, config.bccRecipients],
  ];

  for (const [channel, emails] of channelGroups) {
    for (const email of emails) {
      const targetKey = `email:${email.toLowerCase()}`;
      const existing = await repository.findOne({
        where: { templateId, targetKey },
      });

      const entity = existing ?? repository.create();
      entity.companyId = companyId;
      entity.templateId = templateId;
      entity.channel = channel;
      entity.recipientType = ReportRecipientTypeEnum.EMAIL;
      entity.targetKey = targetKey;
      entity.emailAddress = email;
      entity.displayName = entity.displayName ?? null;

      await repository.save(entity);
    }
  }
}

async function upsertSchedule(
  repository: Repository<ReportSchedule>,
  input: {
    companyId: number;
    templateId: number;
    name: string;
    executionTime: string;
    isActive: boolean;
  },
): Promise<ReportSchedule> {
  const existing = await repository.findOne({
    where: { companyId: input.companyId, name: input.name },
  });

  const entity = existing ?? repository.create();
  entity.companyId = input.companyId;
  entity.templateId = input.templateId;
  entity.name = input.name;
  entity.scheduleType = ReportScheduleTypeEnum.DAILY;
  entity.executionTime = input.executionTime;
  entity.timezone = DEFAULT_ATTENDANCE_REPORT_TIMEZONE;
  entity.misfireHandling = ReportScheduleMisfireHandlingEnum.SKIP;
  entity.maxRetryAttempts = 3;
  entity.isActive = input.isActive;
  entity.pausedAt = null;
  entity.nextRunAt = computeNextScheduleRunAt(
    {
      scheduleType: ReportScheduleTypeEnum.DAILY,
      executionTime: input.executionTime,
      timezone: DEFAULT_ATTENDANCE_REPORT_TIMEZONE,
      weekdays: [],
    },
    new Date(),
  );

  return repository.save(entity);
}
