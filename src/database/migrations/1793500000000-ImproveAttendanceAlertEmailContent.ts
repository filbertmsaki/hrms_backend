import { MigrationInterface, QueryRunner } from 'typeorm';

const UPDATED_TEMPLATES = [
  [
    'attendance.missing',
    'Hello {{employee_name}}, no attendance punch was recorded for {{attendance_date}}. If you were at work, please review your attendance and submit a correction request if needed.',
  ],
  [
    'attendance.late',
    'Hello {{employee_name}}, your attendance record shows a late arrival on {{attendance_date}} ({{late_minutes}} minutes late). If you think this is incorrect, review your attendance and submit a correction request.',
  ],
  [
    'attendance.manager_missing',
    '{{employee_name}} has no attendance punch recorded for {{attendance_date}}. Please review the team attendance record and follow up if a correction is needed.',
  ],
  [
    'attendance.manager_late',
    '{{employee_name}} was recorded late on {{attendance_date}} ({{late_minutes}} minutes). Please review the team attendance record if follow-up is needed.',
  ],
] as const;

const ORIGINAL_TEMPLATES = [
  [
    'attendance.missing',
    'No attendance punch was recorded for {{attendance_date}}. Please review your attendance or submit a correction if needed.',
  ],
  [
    'attendance.late',
    'Late attendance was recorded for {{attendance_date}}. Late minutes: {{late_minutes}}.',
  ],
  [
    'attendance.manager_missing',
    '{{employee_name}} has missing attendance for {{attendance_date}}. Please review the team attendance record.',
  ],
  [
    'attendance.manager_late',
    '{{employee_name}} has late attendance for {{attendance_date}}. Late minutes: {{late_minutes}}.',
  ],
] as const;

export class ImproveAttendanceAlertEmailContent1793500000000 implements MigrationInterface {
  name = 'ImproveAttendanceAlertEmailContent1793500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.updateDefaultTemplates(queryRunner, UPDATED_TEMPLATES);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.updateDefaultTemplates(queryRunner, ORIGINAL_TEMPLATES);
  }

  private async updateDefaultTemplates(
    queryRunner: QueryRunner,
    templates: ReadonlyArray<readonly [string, string]>,
  ): Promise<void> {
    for (const [templateCode, emailBody] of templates) {
      await queryRunner.query(
        `UPDATE "notification_templates"
         SET "email_body" = $2, "updated_at" = now()
         WHERE "company_id" IS NULL AND "template_code" = $1`,
        [templateCode, emailBody],
      );
    }
  }
}
