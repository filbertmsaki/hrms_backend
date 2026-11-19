import { MigrationInterface, QueryRunner } from 'typeorm';

/** Audit/rollback log for the historical leave allocation backfill (FRS-11.4.08). */
export class LeaveAllocationBackfillEntries1797900031000 implements MigrationInterface {
  name = 'LeaveAllocationBackfillEntries1797900031000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "leave_allocation_backfill_entries" (
        "id" SERIAL NOT NULL,
        "batch_id" uuid NOT NULL,
        "company_id" integer NOT NULL,
        "leave_request_id" integer NOT NULL,
        "status" character varying(20) NOT NULL,
        "method" character varying(60),
        "reason" text,
        "before_snapshot" jsonb,
        "after_snapshot" jsonb,
        "before_allocation" jsonb NOT NULL,
        "after_allocation" jsonb,
        "actor" character varying(120) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "applied_at" TIMESTAMP,
        "reverted_at" TIMESTAMP,
        CONSTRAINT "PK_leave_allocation_backfill_entries" PRIMARY KEY ("id")
      )`);
    await q.query(
      `CREATE INDEX "IDX_leave_alloc_backfill_batch" ON "leave_allocation_backfill_entries" ("batch_id")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_leave_alloc_backfill_applied" ON "leave_allocation_backfill_entries" ("leave_request_id") WHERE "status" = 'APPLIED'`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "leave_allocation_backfill_entries"`);
  }
}
