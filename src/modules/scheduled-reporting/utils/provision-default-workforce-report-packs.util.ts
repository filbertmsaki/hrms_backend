import { EntityManager } from 'typeorm';
import { ReportDefinition } from '../entities/report-definition.entity';
import { ReportSchedule } from '../entities/report-schedule.entity';
import { ReportScheduleWeekday } from '../entities/report-schedule-weekday.entity';
import { ReportTemplate } from '../entities/report-template.entity';
import { ReportOutputFormatEnum } from '../enums/report-output-format.enum';
import { ReportScheduleMisfireHandlingEnum } from '../enums/report-schedule-misfire-handling.enum';
import { ReportScheduleTypeEnum } from '../enums/report-schedule-type.enum';
import { ReportTemplateDateRangeStrategyEnum } from '../enums/report-template-date-range-strategy.enum';
import { ReportWeekdayEnum } from '../enums/report-weekday.enum';
import { computeNextScheduleRunAt } from './report-schedule-next-run.util';

const REPORT_TIMEZONE = 'Africa/Dar_es_Salaam';

const DRAFT_REPORT_PACKS = [
  {
    templateName: 'Weekly Activity Report Pack (Draft)',
    reportCode: 'WEEKLY_ACTIVITY',
    scheduleName: 'Weekly Activity Report Pack (Draft) Schedule',
    scheduleType: ReportScheduleTypeEnum.WEEKLY,
    dateRangeStrategy: ReportTemplateDateRangeStrategyEnum.PREVIOUS_WEEK,
    weekdays: [ReportWeekdayEnum.MONDAY],
    dayOfMonth: null,
  },
  {
    templateName: 'Monthly Activity Report Pack (Draft)',
    reportCode: 'MONTHLY_ACTIVITY',
    scheduleName: 'Monthly Activity Report Pack (Draft) Schedule',
    scheduleType: ReportScheduleTypeEnum.MONTHLY,
    dateRangeStrategy: ReportTemplateDateRangeStrategyEnum.PREVIOUS_MONTH,
    weekdays: [],
    dayOfMonth: 1,
  },
  {
    templateName: 'Monthly KPI Score Report Pack (Draft)',
    reportCode: 'MONTHLY_KPI_SCORE',
    scheduleName: 'Monthly KPI Score Report Pack (Draft) Schedule',
    scheduleType: ReportScheduleTypeEnum.MONTHLY,
    dateRangeStrategy: ReportTemplateDateRangeStrategyEnum.PREVIOUS_MONTH,
    weekdays: [],
    dayOfMonth: 1,
  },
  {
    templateName: 'Quarterly KPI Report Pack (Draft)',
    reportCode: 'QUARTERLY_KPI_AVERAGE',
    scheduleName: 'Quarterly KPI Report Pack (Draft) Schedule',
    scheduleType: ReportScheduleTypeEnum.QUARTERLY,
    dateRangeStrategy: ReportTemplateDateRangeStrategyEnum.PREVIOUS_QUARTER,
    weekdays: [],
    dayOfMonth: 1,
  },
  {
    templateName: 'Annual KPI Report Pack (Draft)',
    reportCode: 'ANNUAL_KPI_AVERAGE',
    scheduleName: 'Annual KPI Report Pack (Draft) Schedule',
    scheduleType: ReportScheduleTypeEnum.ANNUAL,
    dateRangeStrategy: ReportTemplateDateRangeStrategyEnum.PREVIOUS_YEAR,
    weekdays: [],
    dayOfMonth: 1,
  },
];

/**
 * Installs inactive, company-owned starter templates for each standard report
 * period. They remain inactive until the company approves its report content,
 * recipients, and delivery configuration.
 */
export async function provisionDefaultWorkforceReportPacksForCompany(
  manager: EntityManager,
  companyId: number,
): Promise<void> {
  const definitions = manager.getRepository(ReportDefinition);
  const templates = manager.getRepository(ReportTemplate);
  const schedules = manager.getRepository(ReportSchedule);
  const weekdays = manager.getRepository(ReportScheduleWeekday);

  for (const pack of DRAFT_REPORT_PACKS) {
    const definition = await definitions.findOne({
      where: { reportCode: pack.reportCode, isActive: true },
    });
    if (!definition) continue;

    let template = await templates.findOne({
      where: { companyId, name: pack.templateName },
    });
    if (!template) {
      template = await templates.save(
        templates.create({
          companyId,
          reportDefinitionId: definition.id,
          smtpConfigurationId: null,
          name: pack.templateName,
          description:
            'Provisional workforce reporting template. Confirm report contents against approved FRS 9.1–9.4 requirements before activation.',
          outputFormat: ReportOutputFormatEnum.CSV,
          filenamePattern: `${pack.reportCode.toLowerCase()}-{{reportDate}}.csv`,
          emailSubjectTemplate: `${pack.templateName} - {{reportDate}}`,
          emailBodyTemplate:
            '<p>Attached is the scheduled workforce report for the selected reporting period.</p>',
          dateRangeStrategy: pack.dateRangeStrategy,
          dateRangeConfig: { timezone: REPORT_TIMEZONE },
          reportFilters: {},
          attachReport: true,
          isActive: false,
          createdByCompanyUserId: null,
          updatedByCompanyUserId: null,
        }),
      );
    }

    let schedule = await schedules.findOne({
      where: { companyId, name: pack.scheduleName },
    });
    if (!schedule) {
      const executionTime = '09:00:00';
      schedule = await schedules.save(
        schedules.create({
          companyId,
          templateId: template.id,
          name: pack.scheduleName,
          scheduleType: pack.scheduleType,
          executionTime,
          dayOfMonth: pack.dayOfMonth,
          timezone: REPORT_TIMEZONE,
          startDate: null,
          endDate: null,
          oneTimeRunAt: null,
          cronExpression: null,
          misfireHandling: ReportScheduleMisfireHandlingEnum.SKIP,
          maxRetryAttempts: 3,
          isActive: false,
          pausedAt: null,
          lastRunAt: null,
          nextRunAt: computeNextScheduleRunAt(
            {
              scheduleType: pack.scheduleType,
              executionTime,
              timezone: REPORT_TIMEZONE,
              dayOfMonth: pack.dayOfMonth,
              weekdays: pack.weekdays,
            },
            new Date(),
          ),
          createdByCompanyUserId: null,
          updatedByCompanyUserId: null,
        }),
      );
    }

    if (pack.weekdays.length) {
      for (const weekday of pack.weekdays) {
        const existing = await weekdays.findOne({
          where: { scheduleId: schedule.id, weekday },
        });
        if (!existing) {
          await weekdays.save(
            weekdays.create({ scheduleId: schedule.id, weekday }),
          );
        }
      }
    }
  }
}
