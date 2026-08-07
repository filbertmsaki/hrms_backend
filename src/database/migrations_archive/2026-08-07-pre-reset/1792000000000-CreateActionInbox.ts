import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateActionInbox1792000000000 implements MigrationInterface {
  name = 'CreateActionInbox1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "action_items" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "assignee_company_user_id" integer NOT NULL,
        "assignee_employee_id" integer,
        "action_type" varchar(40) NOT NULL,
        "source_module" varchar(80) NOT NULL,
        "source_entity_type" varchar(100) NOT NULL,
        "source_entity_id" varchar(100) NOT NULL,
        "source_key" varchar(220) NOT NULL,
        "title" varchar(180) NOT NULL,
        "description" text,
        "priority" varchar(20) NOT NULL DEFAULT 'MEDIUM',
        "status" varchar(30) NOT NULL DEFAULT 'OPEN',
        "branch_id" integer,
        "department_id" integer,
        "action_url" varchar(500),
        "due_at" timestamptz,
        "opened_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        "metadata" jsonb,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_action_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_action_item_assignee_source" UNIQUE (
          "company_id",
          "assignee_company_user_id",
          "source_key"
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_action_item_assignee_status"
      ON "action_items" ("company_id", "assignee_company_user_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_action_item_due"
      ON "action_items" ("status", "due_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "action_items"`);
  }
}
