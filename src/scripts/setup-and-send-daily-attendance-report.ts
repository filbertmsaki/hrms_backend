import { AppDataSource } from '../database/data-source';
import {
  DailyAttendanceReportRunner,
  SetupDailyAttendanceReportInput,
} from '../modules/scheduled-reporting/services/daily-attendance-report-runner';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function main() {
  const input: SetupDailyAttendanceReportInput = {
    companyId: Number(process.env.REPORT_COMPANY_ID ?? '1'),
    recipientEmail: requiredEnv('REPORT_RECIPIENT_EMAIL'),
    smtpHost: requiredEnv('MAIL_HOST'),
    smtpPort: Number(process.env.MAIL_PORT ?? '587'),
    smtpUser: requiredEnv('MAIL_USER'),
    smtpPass: requiredEnv('MAIL_PASS'),
    smtpSecure: process.env.MAIL_SECURE === 'true',
    senderEmail: process.env.MAIL_FROM?.trim() || requiredEnv('MAIL_USER'),
    senderName: process.env.APP_NAME?.trim() || 'HRMS',
    appName: process.env.APP_NAME?.trim() || 'HRMS',
    timezone: process.env.REPORT_TIMEZONE?.trim() || 'Africa/Dar_es_Salaam',
    executionTime: process.env.REPORT_EXECUTION_TIME?.trim() || '08:00:00',
    requestedReportDate: process.env.REPORT_DATE?.trim(),
    fallbackToLatestAvailable:
      (process.env.REPORT_FALLBACK_TO_LATEST ?? 'true') !== 'false',
  };

  await AppDataSource.initialize();

  try {
    const runner = new DailyAttendanceReportRunner(AppDataSource);
    const result = await runner.setupTemplateAndSend(input);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exit(1);
});
