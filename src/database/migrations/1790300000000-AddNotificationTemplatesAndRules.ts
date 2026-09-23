import { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_NOTIFICATION_TEMPLATES = [
  {
    code: 'probation.confirmation_due',
    title: 'Probation Confirmation Due',
    subject: 'Probation confirmation due on {{due_date}}',
    system:
      'Your probation confirmation is due on {{due_date}}. Please review your probation page.',
    email:
      'Hello {{employee_name}}, your probation confirmation is due on {{due_date}}. Please sign in to review the required details.',
    mobile: 'Probation confirmation due on {{due_date}}.',
    variables: ['employee_name', 'due_date', 'days_remaining'],
  },
  {
    code: 'probation.manager_review_required',
    title: 'Probation Manager Review Required',
    subject: 'Probation manager review required',
    system:
      'A probation case has reached its confirmation date and needs your review.',
    email:
      'A probation case has reached its confirmation date and needs your review. Please sign in to complete the review.',
    mobile: 'Probation manager review required.',
    variables: ['employee_id', 'due_date'],
  },
  {
    code: 'attendance.missing',
    title: 'Attendance Missing',
    subject: 'Attendance missing for {{attendance_date}}',
    system: 'No attendance punch was recorded for {{attendance_date}}.',
    email:
      'No attendance punch was recorded for {{attendance_date}}. Please review your attendance or submit a correction if needed.',
    mobile: 'Attendance missing for {{attendance_date}}.',
    variables: ['employee_name', 'attendance_date', 'attendance_status'],
  },
  {
    code: 'attendance.late',
    title: 'Late Attendance',
    subject: 'Late attendance for {{attendance_date}}',
    system:
      'Late attendance was recorded for {{attendance_date}}. Late minutes: {{late_minutes}}.',
    email:
      'Late attendance was recorded for {{attendance_date}}. Late minutes: {{late_minutes}}.',
    mobile: 'Late attendance for {{attendance_date}}.',
    variables: [
      'employee_name',
      'attendance_date',
      'attendance_status',
      'late_minutes',
    ],
  },
  {
    code: 'attendance.manager_missing',
    title: 'Team Attendance Missing',
    subject: 'Team attendance missing for {{employee_name}}',
    system: '{{employee_name}} has missing attendance for {{attendance_date}}.',
    email:
      '{{employee_name}} has missing attendance for {{attendance_date}}. Please review the team attendance record.',
    mobile: '{{employee_name}} has missing attendance.',
    variables: ['employee_name', 'attendance_date', 'attendance_status'],
  },
  {
    code: 'attendance.manager_late',
    title: 'Team Late Attendance',
    subject: 'Late attendance recorded for {{employee_name}}',
    system:
      '{{employee_name}} has late attendance for {{attendance_date}}. Late minutes: {{late_minutes}}.',
    email:
      '{{employee_name}} has late attendance for {{attendance_date}}. Late minutes: {{late_minutes}}.',
    mobile: '{{employee_name}} has late attendance.',
    variables: [
      'employee_name',
      'attendance_date',
      'attendance_status',
      'late_minutes',
    ],
  },
  {
    code: 'daily_activity.not_submitted',
    title: 'Daily Activity Not Submitted',
    subject: 'Daily activity not submitted for {{activity_date}}',
    system:
      'Your daily activity report for {{activity_date}} is not submitted.',
    email:
      'Your daily activity report for {{activity_date}} is not submitted. Please sign in and submit it.',
    mobile: 'Daily activity not submitted for {{activity_date}}.',
    variables: ['employee_name', 'activity_date'],
  },
  {
    code: 'daily_activity.manager_not_submitted',
    title: 'Daily Activity Pending',
    subject: 'Daily activity pending for {{employee_name}}',
    system:
      '{{employee_name}} has not submitted the daily activity report for {{activity_date}}.',
    email:
      '{{employee_name}} has not submitted the daily activity report for {{activity_date}}.',
    mobile: '{{employee_name}} daily activity pending.',
    variables: ['employee_name', 'activity_date'],
  },
  {
    code: 'field_visit.report_pending',
    title: 'Field Visit Report Pending',
    subject: 'Field visit report pending: {{visit_no}}',
    system: 'Submit the outcome for field visit {{visit_no}}.',
    email:
      'Submit the outcome for field visit {{visit_no}} completed on {{visit_date}}.',
    mobile: 'Field visit report pending: {{visit_no}}.',
    variables: ['employee_name', 'visit_no', 'visit_date'],
  },
  {
    code: 'field_visit.manager_report_pending',
    title: 'Field Visit Outcome Pending',
    subject: 'Field visit outcome pending for {{employee_name}}',
    system:
      '{{employee_name}} has a field visit outcome pending for {{visit_no}}.',
    email:
      '{{employee_name}} has a field visit outcome pending for {{visit_no}}.',
    mobile: '{{employee_name}} field visit outcome pending.',
    variables: ['employee_name', 'visit_no', 'visit_date'],
  },
  {
    code: 'performance.kpi_update_pending',
    title: 'KPI Update Pending',
    subject: 'KPI update pending: {{kpi_title}}',
    system:
      'Update KPI "{{kpi_title}}" before completing your review. Due date: {{due_date}}.',
    email:
      'Update KPI "{{kpi_title}}" before completing your review. Due date: {{due_date}}.',
    mobile: 'KPI update pending.',
    variables: ['employee_name', 'kpi_title', 'due_date'],
  },
  {
    code: 'performance.score_published',
    title: 'Performance Score Published',
    subject: 'Your performance score has been published',
    system: 'Your performance score has been published.',
    email:
      'Your performance score has been published. Please sign in to view the review details.',
    mobile: 'Performance score published.',
    variables: ['employee_name', 'final_score', 'rating_code', 'published_at'],
  },
  {
    code: 'payroll.processed',
    title: 'Payroll Processed',
    subject: 'Payroll run {{payroll_run_no}} is {{payroll_status}}',
    system: 'Payroll run {{payroll_run_no}} is {{payroll_status}}.',
    email:
      'Payroll run {{payroll_run_no}} is {{payroll_status}}. Employee count: {{employee_count}}.',
    mobile: 'Payroll run {{payroll_run_no}} processed.',
    variables: ['payroll_run_no', 'payroll_status', 'employee_count'],
  },
  {
    code: 'payroll.payslip_available',
    title: 'Payslip Available',
    subject: 'Your payslip is available',
    system: 'Your payslip is available.',
    email: 'Your payslip is available. Please sign in to view it securely.',
    mobile: 'Payslip available.',
    variables: ['employee_name', 'payslip_no', 'published_at'],
  },
  {
    code: 'employee_finance.installment_posted',
    title: 'Finance Installment Posted',
    subject: 'Employee finance installment posted',
    system: 'An employee finance installment was posted to payroll.',
    email:
      'An employee finance installment was posted to payroll. Please sign in to view your finance details.',
    mobile: 'Finance installment posted.',
    variables: ['employee_name', 'payroll_run_no', 'component_code', 'amount'],
  },
  {
    code: 'approval.overdue',
    title: 'Approval Overdue',
    subject: 'Approval overdue: {{action_item_title}}',
    system: '{{action_item_title}} is overdue.',
    email:
      '{{action_item_title}} is overdue. Please sign in and take the required action.',
    mobile: 'Approval overdue.',
    variables: [
      'action_item_id',
      'action_item_title',
      'source_key',
      'due_at',
      'source_module',
    ],
  },
] as const;

const DEFAULT_NOTIFICATION_RULES = [
  {
    type: 'PROBATION_CONFIRMATION_DUE',
    event: 'probation.confirmation_due',
    module: 'probation',
    recipient: 'EMPLOYEE',
    channels: ['IN_APP', 'EMAIL'],
    priority: 'MEDIUM',
    template: 'probation.confirmation_due',
  },
  {
    type: 'PROBATION_CONFIRMATION_OVERDUE',
    event: 'probation.manager_review_required',
    module: 'probation',
    recipient: 'MANAGER',
    channels: ['IN_APP', 'EMAIL'],
    priority: 'HIGH',
    template: 'probation.manager_review_required',
  },
  {
    type: 'ATTENDANCE_MISSING',
    event: 'attendance.missing',
    module: 'attendance',
    recipient: 'EMPLOYEE',
    channels: ['IN_APP', 'EMAIL'],
    priority: 'HIGH',
    template: 'attendance.missing',
  },
  {
    type: 'ATTENDANCE_LATE',
    event: 'attendance.late',
    module: 'attendance',
    recipient: 'EMPLOYEE',
    channels: ['IN_APP', 'EMAIL'],
    priority: 'MEDIUM',
    template: 'attendance.late',
  },
  {
    type: 'ATTENDANCE_MISSING',
    event: 'attendance.manager_missing',
    module: 'attendance',
    recipient: 'MANAGER',
    channels: ['IN_APP', 'EMAIL'],
    priority: 'HIGH',
    template: 'attendance.manager_missing',
  },
  {
    type: 'ATTENDANCE_LATE',
    event: 'attendance.manager_late',
    module: 'attendance',
    recipient: 'MANAGER',
    channels: ['IN_APP', 'EMAIL'],
    priority: 'MEDIUM',
    template: 'attendance.manager_late',
  },
  {
    type: 'DAILY_ACTIVITY_NOT_SUBMITTED',
    event: 'daily_activity.not_submitted',
    module: 'work-activities',
    recipient: 'EMPLOYEE',
    channels: ['IN_APP', 'EMAIL'],
    priority: 'HIGH',
    template: 'daily_activity.not_submitted',
  },
  {
    type: 'DAILY_ACTIVITY_NOT_SUBMITTED',
    event: 'daily_activity.manager_not_submitted',
    module: 'work-activities',
    recipient: 'MANAGER',
    channels: ['IN_APP'],
    priority: 'MEDIUM',
    template: 'daily_activity.manager_not_submitted',
  },
  {
    type: 'FIELD_VISIT_REPORT_PENDING',
    event: 'field_visit.report_pending',
    module: 'field-visits',
    recipient: 'EMPLOYEE',
    channels: ['IN_APP', 'EMAIL'],
    priority: 'HIGH',
    template: 'field_visit.report_pending',
  },
  {
    type: 'FIELD_VISIT_REPORT_PENDING',
    event: 'field_visit.manager_report_pending',
    module: 'field-visits',
    recipient: 'MANAGER',
    channels: ['IN_APP'],
    priority: 'MEDIUM',
    template: 'field_visit.manager_report_pending',
  },
  {
    type: 'KPI_UPDATE_PENDING',
    event: 'performance.kpi_update_pending',
    module: 'performance',
    recipient: 'EMPLOYEE',
    channels: ['IN_APP', 'EMAIL'],
    priority: 'HIGH',
    template: 'performance.kpi_update_pending',
  },
  {
    type: 'KPI_SCORE_PUBLISHED',
    event: 'performance.score_published',
    module: 'performance',
    recipient: 'EMPLOYEE',
    channels: ['IN_APP', 'EMAIL'],
    priority: 'MEDIUM',
    template: 'performance.score_published',
  },
  {
    type: 'PAYROLL_PROCESSED',
    event: 'payroll.processed',
    module: 'payroll',
    recipient: 'CREATOR',
    channels: ['IN_APP', 'EMAIL'],
    priority: 'HIGH',
    template: 'payroll.processed',
  },
  {
    type: 'PAYSLIP_AVAILABLE',
    event: 'payroll.payslip_available',
    module: 'payroll',
    recipient: 'EMPLOYEE',
    channels: ['IN_APP', 'EMAIL'],
    priority: 'MEDIUM',
    template: 'payroll.payslip_available',
  },
  {
    type: 'STAFF_LOAN_INSTALLMENT_DEDUCTED',
    event: 'employee_finance.installment_posted',
    module: 'employee-finance',
    recipient: 'EMPLOYEE',
    channels: ['IN_APP', 'EMAIL'],
    priority: 'MEDIUM',
    template: 'employee_finance.installment_posted',
  },
  {
    type: 'APPROVAL_OVERDUE',
    event: 'approval.overdue',
    module: 'action-inbox',
    recipient: 'ASSIGNEE',
    channels: ['IN_APP', 'EMAIL'],
    priority: 'HIGH',
    template: 'approval.overdue',
  },
] as const;

export class AddNotificationTemplatesAndRules1790300000000 implements MigrationInterface {
  name = 'AddNotificationTemplatesAndRules1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_templates" (
        "id" SERIAL NOT NULL,
        "company_id" integer,
        "template_code" character varying(120) NOT NULL,
        "title" character varying(180) NOT NULL,
        "email_subject" character varying(220),
        "system_message" text NOT NULL,
        "email_body" text,
        "mobile_message" text,
        "available_variables" jsonb NOT NULL DEFAULT '[]',
        "status" character varying(20) NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_notification_template_company_code" UNIQUE ("company_id", "template_code"),
        CONSTRAINT "PK_notification_templates" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_templates_company_status" ON "notification_templates" ("company_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_templates_code" ON "notification_templates" ("template_code")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_notification_template_global_code" ON "notification_templates" ("template_code") WHERE "company_id" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "notification_rules" (
        "id" SERIAL NOT NULL,
        "company_id" integer,
        "notification_type" character varying(80) NOT NULL,
        "trigger_event" character varying(120) NOT NULL,
        "related_module" character varying(80),
        "reminder_before_minutes" integer,
        "reminder_after_minutes" integer,
        "escalation_after_minutes" integer,
        "repeat_interval_minutes" integer,
        "recipient_type" character varying(80) NOT NULL,
        "channels" jsonb NOT NULL DEFAULT '[]',
        "priority" character varying(20) NOT NULL DEFAULT 'MEDIUM',
        "enabled" boolean NOT NULL DEFAULT true,
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_notification_rule_company_event_recipient" UNIQUE ("company_id", "notification_type", "trigger_event", "recipient_type"),
        CONSTRAINT "PK_notification_rules" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_rules_company_enabled" ON "notification_rules" ("company_id", "enabled")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_rules_type_event" ON "notification_rules" ("notification_type", "trigger_event")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_notification_rule_global_event_recipient" ON "notification_rules" ("notification_type", "trigger_event", "recipient_type") WHERE "company_id" IS NULL`,
    );

    await queryRunner.query(`
      ALTER TABLE "notification_templates"
      ADD CONSTRAINT "FK_notification_templates_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "notification_rules"
      ADD CONSTRAINT "FK_notification_rules_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await this.seedDefaultTemplates(queryRunner);
    await this.seedDefaultRules(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "notification_rules" WHERE "company_id" IS NULL AND "trigger_event" = ANY($1)`,
      [DEFAULT_NOTIFICATION_RULES.map((rule) => rule.event)],
    );
    await queryRunner.query(
      `DELETE FROM "notification_templates" WHERE "company_id" IS NULL AND "template_code" = ANY($1)`,
      [DEFAULT_NOTIFICATION_TEMPLATES.map((template) => template.code)],
    );
    await queryRunner.query(
      `ALTER TABLE "notification_rules" DROP CONSTRAINT "FK_notification_rules_company"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_templates" DROP CONSTRAINT "FK_notification_templates_company"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notification_rules_type_event"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_notification_rule_global_event_recipient"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notification_rules_company_enabled"`,
    );
    await queryRunner.query(`DROP TABLE "notification_rules"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_notification_template_global_code"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notification_templates_code"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notification_templates_company_status"`,
    );
    await queryRunner.query(`DROP TABLE "notification_templates"`);
  }

  private async seedDefaultTemplates(queryRunner: QueryRunner): Promise<void> {
    for (const template of DEFAULT_NOTIFICATION_TEMPLATES) {
      await queryRunner.query(
        `
          INSERT INTO "notification_templates" (
            "company_id",
            "template_code",
            "title",
            "email_subject",
            "system_message",
            "email_body",
            "mobile_message",
            "available_variables",
            "status"
          )
          VALUES (NULL, $1, $2, $3, $4, $5, $6, $7::jsonb, 'ACTIVE')
          ON CONFLICT ("template_code") WHERE "company_id" IS NULL
          DO UPDATE SET
            "title" = EXCLUDED."title",
            "email_subject" = EXCLUDED."email_subject",
            "system_message" = EXCLUDED."system_message",
            "email_body" = EXCLUDED."email_body",
            "mobile_message" = EXCLUDED."mobile_message",
            "available_variables" = EXCLUDED."available_variables",
            "updated_at" = now()
        `,
        [
          template.code,
          template.title,
          template.subject,
          template.system,
          template.email,
          template.mobile,
          JSON.stringify(template.variables),
        ],
      );
    }
  }

  private async seedDefaultRules(queryRunner: QueryRunner): Promise<void> {
    for (const rule of DEFAULT_NOTIFICATION_RULES) {
      await queryRunner.query(
        `
          INSERT INTO "notification_rules" (
            "company_id",
            "notification_type",
            "trigger_event",
            "related_module",
            "recipient_type",
            "channels",
            "priority",
            "enabled",
            "metadata"
          )
          VALUES (NULL, $1, $2, $3, $4, $5::jsonb, $6, true, $7::jsonb)
          ON CONFLICT ("notification_type", "trigger_event", "recipient_type")
          WHERE "company_id" IS NULL
          DO UPDATE SET
            "related_module" = EXCLUDED."related_module",
            "channels" = EXCLUDED."channels",
            "priority" = EXCLUDED."priority",
            "enabled" = EXCLUDED."enabled",
            "metadata" = EXCLUDED."metadata",
            "updated_at" = now()
        `,
        [
          rule.type,
          rule.event,
          rule.module,
          rule.recipient,
          JSON.stringify(rule.channels),
          rule.priority,
          JSON.stringify({ template_code: rule.template }),
        ],
      );
    }
  }
}
