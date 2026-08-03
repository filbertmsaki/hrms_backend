import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSecurityAuditAndDataScopes1791200000000
  implements MigrationInterface
{
  name = 'AddSecurityAuditAndDataScopes1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "security_events" (
        "id" SERIAL NOT NULL,
        "event_type" varchar(120) NOT NULL,
        "outcome" varchar(20) NOT NULL,
        "company_id" integer,
        "actor_user_id" integer,
        "actor_company_user_id" integer,
        "target_user_id" integer,
        "target_company_user_id" integer,
        "role_id" integer,
        "permission_id" integer,
        "resource_type" varchar(100),
        "resource_id" varchar(100),
        "request_id" varchar(100),
        "session_id" varchar(100),
        "ip_address" varchar(45),
        "user_agent" text,
        "reason" text,
        "old_values" jsonb,
        "new_values" jsonb,
        "metadata" jsonb,
        "occurred_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_security_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_security_event_company"
      ON "security_events" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_security_event_actor"
      ON "security_events" ("actor_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_security_event_target"
      ON "security_events" ("target_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_security_event_type"
      ON "security_events" ("event_type")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_security_event_occurred"
      ON "security_events" ("occurred_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "company_user_department_accesses" (
        "id" SERIAL NOT NULL,
        "company_user_id" integer NOT NULL,
        "department_id" integer NOT NULL,
        "granted_by_company_user_id" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_company_user_department_access" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_company_user_department_access" UNIQUE ("company_user_id", "department_id"),
        CONSTRAINT "FK_department_access_company_user"
          FOREIGN KEY ("company_user_id")
          REFERENCES "company_users"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_department_access_department"
          FOREIGN KEY ("department_id")
          REFERENCES "departments"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_department_access_granted_by"
          FOREIGN KEY ("granted_by_company_user_id")
          REFERENCES "company_users"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_department_access_company_user"
      ON "company_user_department_accesses" ("company_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_department_access_department"
      ON "company_user_department_accesses" ("department_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "company_user_department_accesses"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "security_events"
    `);
  }
}
