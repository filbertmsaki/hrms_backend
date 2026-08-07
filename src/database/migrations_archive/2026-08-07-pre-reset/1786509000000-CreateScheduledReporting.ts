import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateScheduledReporting1786509000000 implements MigrationInterface {
  name = 'CreateScheduledReporting1786509000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."report_smtp_security_type_enum" AS ENUM(
        'NONE',
        'STARTTLS',
        'SSL_TLS',
        'AUTO'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."report_smtp_test_status_enum" AS ENUM(
        'UNTESTED',
        'SUCCESS',
        'FAILED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."report_output_format_enum" AS ENUM(
        'PDF',
        'XLSX',
        'CSV'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."report_recipient_channel_enum" AS ENUM(
        'TO',
        'CC',
        'BCC'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."report_recipient_type_enum" AS ENUM(
        'EMAIL',
        'COMPANY_USER',
        'EMPLOYEE',
        'ROLE',
        'DEPARTMENT',
        'DEPARTMENT_MANAGER',
        'DYNAMIC_GROUP'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."report_schedule_type_enum" AS ENUM(
        'DAILY',
        'WEEKLY',
        'MONTHLY',
        'ONE_TIME',
        'MANUAL'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."report_schedule_misfire_handling_enum" AS ENUM(
        'SKIP',
        'RUN_IMMEDIATELY',
        'DEFER_TO_NEXT_WINDOW'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."report_weekday_enum" AS ENUM(
        'SUNDAY',
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."report_template_date_range_strategy_enum" AS ENUM(
        'CURRENT_DAY',
        'PREVIOUS_DAY',
        'CURRENT_WEEK',
        'PREVIOUS_WEEK',
        'CURRENT_MONTH',
        'PREVIOUS_MONTH',
        'CUSTOM',
        'SCHEDULE_RELATIVE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."report_execution_source_enum" AS ENUM(
        'SCHEDULER',
        'MANUAL',
        'API',
        'RETRY',
        'SYSTEM'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."report_execution_status_enum" AS ENUM(
        'PENDING',
        'QUEUED',
        'GENERATING',
        'GENERATED',
        'SENDING',
        'SENT',
        'PARTIALLY_SENT',
        'FAILED',
        'CANCELLED',
        'SKIPPED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."report_email_delivery_status_enum" AS ENUM(
        'PENDING',
        'SENT',
        'PARTIALLY_SENT',
        'FAILED',
        'SKIPPED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."report_execution_attempt_phase_enum" AS ENUM(
        'OVERALL',
        'GENERATION',
        'EMAIL_DELIVERY'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."report_attempt_status_enum" AS ENUM(
        'PENDING',
        'SUCCESS',
        'FAILED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "report_definitions" (
        "id" SERIAL NOT NULL,
        "report_code" character varying(100) NOT NULL,
        "name" character varying(150) NOT NULL,
        "description" text,
        "supported_filters" jsonb,
        "supported_formats" "public"."report_output_format_enum" array NOT NULL,
        "generator_service" character varying(150) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_report_definitions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_report_definitions_report_code" UNIQUE ("report_code")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_definitions_is_active"
      ON "report_definitions" ("is_active")
    `);

    await queryRunner.query(`
      INSERT INTO "report_definitions" (
        "report_code",
        "name",
        "description",
        "supported_filters",
        "supported_formats",
        "generator_service",
        "is_active"
      )
      VALUES
        (
          'ATTENDANCE_SUMMARY',
          'Attendance Summary',
          'Aggregated attendance report for filtered employees and periods.',
          '{"fields":["company_id","branch_id","department_id","employee_id","employee_no","attendance_status","date_from","date_to","late_only","early_checkout_only","missing_check_in","missing_check_out","present_only","absent_only"]}'::jsonb,
          ARRAY['PDF','XLSX','CSV']::"public"."report_output_format_enum"[],
          'AttendanceSummaryReportGenerator',
          true
        ),
        (
          'ATTENDANCE_DETAILED',
          'Attendance Detailed Report',
          'Detailed attendance report with schedule and punch level output columns.',
          '{"fields":["company_id","branch_id","department_id","employee_id","employee_no","attendance_status","date_from","date_to","late_only","early_checkout_only","missing_check_in","missing_check_out","present_only","absent_only"]}'::jsonb,
          ARRAY['PDF','XLSX','CSV']::"public"."report_output_format_enum"[],
          'AttendanceDetailedReportGenerator',
          true
        ),
        (
          'ATTENDANCE_LATE_ARRIVAL',
          'Late Arrival Report',
          'Attendance report focused on late arrivals for a selected period.',
          '{"fields":["company_id","branch_id","department_id","employee_id","employee_no","date_from","date_to","late_only"]}'::jsonb,
          ARRAY['PDF','XLSX','CSV']::"public"."report_output_format_enum"[],
          'LateArrivalReportGenerator',
          true
        ),
        (
          'ATTENDANCE_MISSING_PUNCH',
          'Missing Check-In or Check-Out Report',
          'Attendance exception report for missing punch scenarios.',
          '{"fields":["company_id","branch_id","department_id","employee_id","employee_no","date_from","date_to","missing_check_in","missing_check_out"]}'::jsonb,
          ARRAY['PDF','XLSX','CSV']::"public"."report_output_format_enum"[],
          'MissingPunchReportGenerator',
          true
        ),
        (
          'LEAVE_SUMMARY',
          'Leave Report',
          'Leave request and balance reporting definition.',
          '{"fields":["company_id","branch_id","department_id","employee_id","employee_no","date_from","date_to","leave_type_id","leave_status"]}'::jsonb,
          ARRAY['PDF','XLSX','CSV']::"public"."report_output_format_enum"[],
          'LeaveReportGenerator',
          true
        ),
        (
          'EMPLOYEE_DIRECTORY',
          'Employee Report',
          'Employee master-data reporting definition.',
          '{"fields":["company_id","branch_id","department_id","employee_id","employee_no","employment_status","employment_type"]}'::jsonb,
          ARRAY['PDF','XLSX','CSV']::"public"."report_output_format_enum"[],
          'EmployeeReportGenerator',
          true
        )
    `);

    await queryRunner.query(`
      CREATE TABLE "report_smtp_configurations" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "name" character varying(150) NOT NULL,
        "host" character varying(255) NOT NULL,
        "port" integer NOT NULL,
        "security_type" "public"."report_smtp_security_type_enum" NOT NULL DEFAULT 'STARTTLS',
        "username" character varying(255),
        "encrypted_password" text,
        "sender_name" character varying(150),
        "sender_email" character varying(255) NOT NULL,
        "reply_to_email" character varying(255),
        "connection_timeout_ms" integer NOT NULL DEFAULT 10000,
        "is_active" boolean NOT NULL DEFAULT false,
        "is_default" boolean NOT NULL DEFAULT false,
        "last_test_status" "public"."report_smtp_test_status_enum" NOT NULL DEFAULT 'UNTESTED',
        "last_tested_at" TIMESTAMP,
        "last_test_error" text,
        "created_by_company_user_id" integer,
        "updated_by_company_user_id" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_report_smtp_configurations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_report_smtp_configurations_company_name" UNIQUE ("company_id", "name"),
        CONSTRAINT "CHK_report_smtp_configurations_timeout_positive" CHECK ("connection_timeout_ms" > 0)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "report_smtp_configurations"
      ADD CONSTRAINT "FK_report_smtp_configurations_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_smtp_configurations"
      ADD CONSTRAINT "FK_report_smtp_configurations_created_by_company_user"
      FOREIGN KEY ("created_by_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_smtp_configurations"
      ADD CONSTRAINT "FK_report_smtp_configurations_updated_by_company_user"
      FOREIGN KEY ("updated_by_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_smtp_configurations_company_id"
      ON "report_smtp_configurations" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_smtp_configurations_company_active"
      ON "report_smtp_configurations" ("company_id", "is_active")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_smtp_configurations_company_default"
      ON "report_smtp_configurations" ("company_id", "is_default")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_report_smtp_configurations_company_default_only"
      ON "report_smtp_configurations" ("company_id")
      WHERE "is_default" = true
    `);

    await queryRunner.query(`
      CREATE TABLE "report_templates" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "report_definition_id" integer NOT NULL,
        "smtp_configuration_id" integer,
        "name" character varying(150) NOT NULL,
        "description" text,
        "output_format" "public"."report_output_format_enum",
        "filename_pattern" character varying(255),
        "email_subject_template" character varying(255),
        "email_body_template" text,
        "date_range_strategy" "public"."report_template_date_range_strategy_enum",
        "date_range_config" jsonb,
        "report_filters" jsonb,
        "attach_report" boolean NOT NULL DEFAULT true,
        "is_active" boolean NOT NULL DEFAULT false,
        "created_by_company_user_id" integer,
        "updated_by_company_user_id" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_report_templates" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_report_templates_company_name" UNIQUE ("company_id", "name")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "report_templates"
      ADD CONSTRAINT "FK_report_templates_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_templates"
      ADD CONSTRAINT "FK_report_templates_report_definition"
      FOREIGN KEY ("report_definition_id") REFERENCES "report_definitions"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_templates"
      ADD CONSTRAINT "FK_report_templates_smtp_configuration"
      FOREIGN KEY ("smtp_configuration_id") REFERENCES "report_smtp_configurations"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_templates"
      ADD CONSTRAINT "FK_report_templates_created_by_company_user"
      FOREIGN KEY ("created_by_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_templates"
      ADD CONSTRAINT "FK_report_templates_updated_by_company_user"
      FOREIGN KEY ("updated_by_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_templates_company_id"
      ON "report_templates" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_templates_definition_id"
      ON "report_templates" ("report_definition_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_templates_smtp_configuration_id"
      ON "report_templates" ("smtp_configuration_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_templates_company_active"
      ON "report_templates" ("company_id", "is_active")
    `);

    await queryRunner.query(`
      CREATE TABLE "report_template_recipients" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "template_id" integer NOT NULL,
        "channel" "public"."report_recipient_channel_enum" NOT NULL,
        "recipient_type" "public"."report_recipient_type_enum" NOT NULL,
        "target_key" character varying(191) NOT NULL,
        "email_address" character varying(255),
        "company_user_id" integer,
        "employee_id" integer,
        "role_id" integer,
        "department_id" integer,
        "dynamic_group_code" character varying(100),
        "display_name" character varying(150),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_report_template_recipients" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_report_template_recipients_template_target" UNIQUE ("template_id", "target_key"),
        CONSTRAINT "CHK_report_template_recipients_target_key_not_blank" CHECK (BTRIM("target_key") <> ''),
        CONSTRAINT "CHK_report_template_recipients_target_presence" CHECK (
          ("recipient_type" = 'EMAIL' AND "email_address" IS NOT NULL)
          OR ("recipient_type" = 'COMPANY_USER' AND "company_user_id" IS NOT NULL)
          OR ("recipient_type" = 'EMPLOYEE' AND "employee_id" IS NOT NULL)
          OR ("recipient_type" = 'ROLE' AND "role_id" IS NOT NULL)
          OR ("recipient_type" = 'DEPARTMENT' AND "department_id" IS NOT NULL)
          OR ("recipient_type" = 'DEPARTMENT_MANAGER' AND "department_id" IS NOT NULL)
          OR ("recipient_type" = 'DYNAMIC_GROUP' AND "dynamic_group_code" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "report_template_recipients"
      ADD CONSTRAINT "FK_report_template_recipients_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_template_recipients"
      ADD CONSTRAINT "FK_report_template_recipients_template"
      FOREIGN KEY ("template_id") REFERENCES "report_templates"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_template_recipients"
      ADD CONSTRAINT "FK_report_template_recipients_company_user"
      FOREIGN KEY ("company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_template_recipients"
      ADD CONSTRAINT "FK_report_template_recipients_employee"
      FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_template_recipients"
      ADD CONSTRAINT "FK_report_template_recipients_role"
      FOREIGN KEY ("role_id") REFERENCES "roles"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_template_recipients"
      ADD CONSTRAINT "FK_report_template_recipients_department"
      FOREIGN KEY ("department_id") REFERENCES "departments"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_template_recipients_company_id"
      ON "report_template_recipients" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_template_recipients_template_id"
      ON "report_template_recipients" ("template_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_template_recipients_channel"
      ON "report_template_recipients" ("channel")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_template_recipients_type"
      ON "report_template_recipients" ("recipient_type")
    `);

    await queryRunner.query(`
      CREATE TABLE "report_schedules" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "template_id" integer NOT NULL,
        "name" character varying(150) NOT NULL,
        "schedule_type" "public"."report_schedule_type_enum" NOT NULL,
        "execution_time" time,
        "day_of_month" integer,
        "timezone" character varying(100) NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
        "start_date" date,
        "end_date" date,
        "one_time_run_at" TIMESTAMP,
        "cron_expression" character varying(120),
        "misfire_handling" "public"."report_schedule_misfire_handling_enum" NOT NULL DEFAULT 'SKIP',
        "max_retry_attempts" integer NOT NULL DEFAULT 3,
        "is_active" boolean NOT NULL DEFAULT false,
        "paused_at" TIMESTAMP,
        "last_run_at" TIMESTAMP,
        "next_run_at" TIMESTAMP,
        "created_by_company_user_id" integer,
        "updated_by_company_user_id" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_report_schedules" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_report_schedules_company_name" UNIQUE ("company_id", "name"),
        CONSTRAINT "CHK_report_schedules_day_of_month" CHECK ("day_of_month" IS NULL OR ("day_of_month" >= 1 AND "day_of_month" <= 31)),
        CONSTRAINT "CHK_report_schedules_max_retry_attempts" CHECK ("max_retry_attempts" >= 0)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "report_schedules"
      ADD CONSTRAINT "FK_report_schedules_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_schedules"
      ADD CONSTRAINT "FK_report_schedules_template"
      FOREIGN KEY ("template_id") REFERENCES "report_templates"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_schedules"
      ADD CONSTRAINT "FK_report_schedules_created_by_company_user"
      FOREIGN KEY ("created_by_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_schedules"
      ADD CONSTRAINT "FK_report_schedules_updated_by_company_user"
      FOREIGN KEY ("updated_by_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_schedules_company_id"
      ON "report_schedules" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_schedules_template_id"
      ON "report_schedules" ("template_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_schedules_type"
      ON "report_schedules" ("schedule_type")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_schedules_next_run_at"
      ON "report_schedules" ("next_run_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_schedules_company_active_next_run"
      ON "report_schedules" ("company_id", "is_active", "next_run_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "report_schedule_weekdays" (
        "id" SERIAL NOT NULL,
        "schedule_id" integer NOT NULL,
        "weekday" "public"."report_weekday_enum" NOT NULL,
        CONSTRAINT "PK_report_schedule_weekdays" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_report_schedule_weekdays_schedule_weekday" UNIQUE ("schedule_id", "weekday")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "report_schedule_weekdays"
      ADD CONSTRAINT "FK_report_schedule_weekdays_schedule"
      FOREIGN KEY ("schedule_id") REFERENCES "report_schedules"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_schedule_weekdays_schedule_id"
      ON "report_schedule_weekdays" ("schedule_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "report_executions" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "template_id" integer NOT NULL,
        "schedule_id" integer,
        "report_definition_id" integer,
        "smtp_configuration_id" integer,
        "source" "public"."report_execution_source_enum" NOT NULL,
        "status" "public"."report_execution_status_enum" NOT NULL DEFAULT 'PENDING',
        "email_delivery_status" "public"."report_email_delivery_status_enum" NOT NULL DEFAULT 'PENDING',
        "idempotency_key" character varying(191) NOT NULL,
        "queue_job_id" character varying(191),
        "started_at" TIMESTAMP,
        "completed_at" TIMESTAMP,
        "report_date_from" date,
        "report_date_to" date,
        "applied_filters" jsonb,
        "execution_metadata" jsonb,
        "generated_filename" character varying(255),
        "generated_file_path" text,
        "generated_file_mime_type" character varying(150),
        "generated_file_size" bigint,
        "record_count" integer NOT NULL DEFAULT 0,
        "retry_count" integer NOT NULL DEFAULT 0,
        "max_retry_attempts" integer NOT NULL DEFAULT 0,
        "error_message" text,
        "technical_details" text,
        "triggered_by_company_user_id" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_report_executions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_report_executions_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "UQ_report_executions_queue_job_id" UNIQUE ("queue_job_id"),
        CONSTRAINT "CHK_report_executions_record_count" CHECK ("record_count" >= 0),
        CONSTRAINT "CHK_report_executions_retry_count" CHECK ("retry_count" >= 0),
        CONSTRAINT "CHK_report_executions_max_retry_attempts" CHECK ("max_retry_attempts" >= 0)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "report_executions"
      ADD CONSTRAINT "FK_report_executions_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_executions"
      ADD CONSTRAINT "FK_report_executions_template"
      FOREIGN KEY ("template_id") REFERENCES "report_templates"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_executions"
      ADD CONSTRAINT "FK_report_executions_schedule"
      FOREIGN KEY ("schedule_id") REFERENCES "report_schedules"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_executions"
      ADD CONSTRAINT "FK_report_executions_report_definition"
      FOREIGN KEY ("report_definition_id") REFERENCES "report_definitions"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_executions"
      ADD CONSTRAINT "FK_report_executions_smtp_configuration"
      FOREIGN KEY ("smtp_configuration_id") REFERENCES "report_smtp_configurations"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "report_executions"
      ADD CONSTRAINT "FK_report_executions_triggered_by_company_user"
      FOREIGN KEY ("triggered_by_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_executions_company_id"
      ON "report_executions" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_executions_template_id"
      ON "report_executions" ("template_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_executions_schedule_id"
      ON "report_executions" ("schedule_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_executions_status"
      ON "report_executions" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_executions_delivery_status"
      ON "report_executions" ("email_delivery_status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_executions_created_at"
      ON "report_executions" ("created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_executions_company_status_created"
      ON "report_executions" ("company_id", "status", "created_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "report_execution_recipients" (
        "id" SERIAL NOT NULL,
        "execution_id" integer NOT NULL,
        "channel" "public"."report_recipient_channel_enum" NOT NULL,
        "source_type" "public"."report_recipient_type_enum" NOT NULL,
        "email_address" character varying(255) NOT NULL,
        "display_name" character varying(150),
        "source_label" character varying(255),
        "delivery_status" "public"."report_email_delivery_status_enum" NOT NULL DEFAULT 'PENDING',
        "error_message" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_report_execution_recipients" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_report_execution_recipients_execution_channel_email" UNIQUE ("execution_id", "channel", "email_address")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "report_execution_recipients"
      ADD CONSTRAINT "FK_report_execution_recipients_execution"
      FOREIGN KEY ("execution_id") REFERENCES "report_executions"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_execution_recipients_execution_id"
      ON "report_execution_recipients" ("execution_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_execution_recipients_channel"
      ON "report_execution_recipients" ("channel")
    `);

    await queryRunner.query(`
      CREATE TABLE "report_execution_attempts" (
        "id" SERIAL NOT NULL,
        "execution_id" integer NOT NULL,
        "attempt_number" integer NOT NULL,
        "phase" "public"."report_execution_attempt_phase_enum" NOT NULL,
        "status" "public"."report_attempt_status_enum" NOT NULL DEFAULT 'PENDING',
        "started_at" TIMESTAMP,
        "completed_at" TIMESTAMP,
        "error_message" text,
        "technical_details" text,
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_report_execution_attempts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_report_execution_attempts_execution_phase_attempt" UNIQUE ("execution_id", "phase", "attempt_number")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "report_execution_attempts"
      ADD CONSTRAINT "FK_report_execution_attempts_execution"
      FOREIGN KEY ("execution_id") REFERENCES "report_executions"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_execution_attempts_execution_id"
      ON "report_execution_attempts" ("execution_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_execution_attempts_phase"
      ON "report_execution_attempts" ("phase")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_report_execution_attempts_status"
      ON "report_execution_attempts" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_execution_attempts_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_execution_attempts_phase"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_execution_attempts_execution_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "report_execution_attempts"
      DROP CONSTRAINT "FK_report_execution_attempts_execution"
    `);
    await queryRunner.query(`DROP TABLE "report_execution_attempts"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_execution_recipients_channel"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_execution_recipients_execution_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "report_execution_recipients"
      DROP CONSTRAINT "FK_report_execution_recipients_execution"
    `);
    await queryRunner.query(`DROP TABLE "report_execution_recipients"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_executions_company_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_executions_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_executions_delivery_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_executions_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_executions_schedule_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_executions_template_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_executions_company_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "report_executions"
      DROP CONSTRAINT "FK_report_executions_triggered_by_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_executions"
      DROP CONSTRAINT "FK_report_executions_smtp_configuration"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_executions"
      DROP CONSTRAINT "FK_report_executions_report_definition"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_executions"
      DROP CONSTRAINT "FK_report_executions_schedule"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_executions"
      DROP CONSTRAINT "FK_report_executions_template"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_executions"
      DROP CONSTRAINT "FK_report_executions_company"
    `);
    await queryRunner.query(`DROP TABLE "report_executions"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_schedule_weekdays_schedule_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "report_schedule_weekdays"
      DROP CONSTRAINT "FK_report_schedule_weekdays_schedule"
    `);
    await queryRunner.query(`DROP TABLE "report_schedule_weekdays"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_schedules_company_active_next_run"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_schedules_next_run_at"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_report_schedules_type"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_schedules_template_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_schedules_company_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "report_schedules"
      DROP CONSTRAINT "FK_report_schedules_updated_by_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_schedules"
      DROP CONSTRAINT "FK_report_schedules_created_by_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_schedules"
      DROP CONSTRAINT "FK_report_schedules_template"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_schedules"
      DROP CONSTRAINT "FK_report_schedules_company"
    `);
    await queryRunner.query(`DROP TABLE "report_schedules"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_template_recipients_type"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_template_recipients_channel"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_template_recipients_template_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_template_recipients_company_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "report_template_recipients"
      DROP CONSTRAINT "FK_report_template_recipients_department"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_template_recipients"
      DROP CONSTRAINT "FK_report_template_recipients_role"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_template_recipients"
      DROP CONSTRAINT "FK_report_template_recipients_employee"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_template_recipients"
      DROP CONSTRAINT "FK_report_template_recipients_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_template_recipients"
      DROP CONSTRAINT "FK_report_template_recipients_template"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_template_recipients"
      DROP CONSTRAINT "FK_report_template_recipients_company"
    `);
    await queryRunner.query(`DROP TABLE "report_template_recipients"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_templates_company_active"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_templates_smtp_configuration_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_templates_definition_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_templates_company_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "report_templates"
      DROP CONSTRAINT "FK_report_templates_updated_by_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_templates"
      DROP CONSTRAINT "FK_report_templates_created_by_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_templates"
      DROP CONSTRAINT "FK_report_templates_smtp_configuration"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_templates"
      DROP CONSTRAINT "FK_report_templates_report_definition"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_templates"
      DROP CONSTRAINT "FK_report_templates_company"
    `);
    await queryRunner.query(`DROP TABLE "report_templates"`);

    await queryRunner.query(
      `DROP INDEX "public"."UQ_report_smtp_configurations_company_default_only"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_smtp_configurations_company_default"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_smtp_configurations_company_active"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_smtp_configurations_company_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "report_smtp_configurations"
      DROP CONSTRAINT "FK_report_smtp_configurations_updated_by_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_smtp_configurations"
      DROP CONSTRAINT "FK_report_smtp_configurations_created_by_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "report_smtp_configurations"
      DROP CONSTRAINT "FK_report_smtp_configurations_company"
    `);
    await queryRunner.query(`DROP TABLE "report_smtp_configurations"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_report_definitions_is_active"`,
    );
    await queryRunner.query(`DROP TABLE "report_definitions"`);

    await queryRunner.query(`DROP TYPE "public"."report_attempt_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."report_execution_attempt_phase_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."report_email_delivery_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."report_execution_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."report_execution_source_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."report_template_date_range_strategy_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."report_weekday_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."report_schedule_misfire_handling_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."report_schedule_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."report_recipient_type_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."report_recipient_channel_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."report_output_format_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."report_smtp_test_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."report_smtp_security_type_enum"`,
    );
  }
}
