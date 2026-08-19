import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import {
  provisionDefaultAttendanceReportsForCompany,
  resolveDefaultAttendanceReportsConfigFromEnv,
} from '../../modules/scheduled-reporting/utils/provision-default-attendance-reports.util';

/**
 * Backfills the two default "system" attendance reports - Morning Attendance
 * Report and End of Day Attendance Report - for every company that already
 * existed before this feature shipped. Companies created afterwards get them
 * automatically via `AttendanceDefaultReportsProvisioningService`, called at
 * company-creation time (see `CompaniesService.createCompanyWithAdministrator`).
 * Both paths share the same idempotent provisioning logic in
 * `provision-default-attendance-reports.util.ts`.
 *
 * These reports are enabled by default (see ATTENDANCE_MORNING_REPORT_ENABLED
 * / ATTENDANCE_DAILY_REPORT_ENABLED, both default `true`) so they behave as
 * built-in reports rather than something an admin has to opt into.
 *
 * IMPORTANT: this seeder deliberately does NOT assign a smtpConfigurationId
 * to the templates it creates/updates (SMTP is per-company and must be
 * configured by an admin via POST /scheduled-reporting/smtp-configurations
 * before email delivery for these reports will actually fire).
 *
 * Safe to run multiple times: templates/schedules/recipients are upserted by
 * natural key (companyId + name / templateId + targetKey), never duplicated.
 */
export default class AttendanceScheduledReportsSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const config = resolveDefaultAttendanceReportsConfigFromEnv();

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const companyRepository = qr.manager.getRepository(Company);
      const companies = await companyRepository.find();

      for (const company of companies) {
        await provisionDefaultAttendanceReportsForCompany(
          qr.manager,
          company.id,
          config,
        );
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][AttendanceScheduledReports] Provisioned morning/end-of-day attendance report templates for ${companies.length} compan${companies.length === 1 ? 'y' : 'ies'}. SMTP configuration is NOT assigned by this seeder - an admin must configure it per company via POST /scheduled-reporting/smtp-configurations before email delivery will fire.`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][AttendanceScheduledReports] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
