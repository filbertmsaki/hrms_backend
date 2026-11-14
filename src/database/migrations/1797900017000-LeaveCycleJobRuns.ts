import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveCycleJobRuns1797900017000 implements MigrationInterface {
  name = 'LeaveCycleJobRuns1797900017000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "leave_cycle_job_runs" (
      "id" SERIAL PRIMARY KEY,
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "run_date" date NOT NULL,
      "status" varchar(12) NOT NULL CHECK ("status" IN ('running','succeeded','failed')),
      "attempts" integer NOT NULL DEFAULT 1,
      "started_at" timestamptz NOT NULL DEFAULT now(),
      "finished_at" timestamptz NULL,
      "error" text NULL,
      "stats" jsonb NULL,
      CONSTRAINT "UQ_leave_cycle_job_run" UNIQUE ("company_id", "run_date")
    )`);
    await q.query(`CREATE TABLE "leave_notification_log" (
      "id" SERIAL PRIMARY KEY,
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "dedupe_key" varchar(200) NOT NULL,
      "recipients" jsonb NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_leave_notification_log" UNIQUE ("company_id", "dedupe_key")
    )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE "leave_notification_log"');
    await q.query('DROP TABLE "leave_cycle_job_runs"');
  }
}
