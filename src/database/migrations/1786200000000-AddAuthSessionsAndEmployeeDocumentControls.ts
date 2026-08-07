import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthSessionsAndEmployeeDocumentControls1786200000000 implements MigrationInterface {
  name = 'AddAuthSessionsAndEmployeeDocumentControls1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auth_sessions" (
        "id" uuid NOT NULL,
        "user_id" integer NOT NULL,
        "company_id" integer,
        "scope" character varying(20) NOT NULL,
        "user_type" character varying(20) NOT NULL,
        "device_type" character varying(30) NOT NULL DEFAULT 'web',
        "device_name" character varying(120) NOT NULL,
        "user_agent" text,
        "ip_address" character varying(45),
        "last_activity_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "last_activity_ip" character varying(45),
        "refresh_expires_at" TIMESTAMPTZ NOT NULL,
        "revoked_at" TIMESTAMPTZ,
        "revocation_reason" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_sessions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auth_session_user"
      ON "auth_sessions" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auth_session_company"
      ON "auth_sessions" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auth_session_user_active"
      ON "auth_sessions" ("user_id", "revoked_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auth_session_refresh_expires"
      ON "auth_sessions" ("refresh_expires_at")
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_auth_sessions_user'
            AND table_name = 'auth_sessions'
        ) THEN
          ALTER TABLE "auth_sessions"
            ADD CONSTRAINT "FK_auth_sessions_user"
            FOREIGN KEY ("user_id") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_auth_sessions_company'
            AND table_name = 'auth_sessions'
        ) THEN
          ALTER TABLE "auth_sessions"
            ADD CONSTRAINT "FK_auth_sessions_company"
            FOREIGN KEY ("company_id") REFERENCES "companies"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      ADD COLUMN IF NOT EXISTS "classification" character varying(30) NOT NULL DEFAULT 'PRIVATE'
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      ADD COLUMN IF NOT EXISTS "metadata" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      ADD COLUMN IF NOT EXISTS "retention_until" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      ADD COLUMN IF NOT EXISTS "download_count" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      ADD COLUMN IF NOT EXISTS "last_downloaded_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      ADD COLUMN IF NOT EXISTS "last_downloaded_by_company_user_id" integer
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_employee_document_retention_until"
      ON "employee_documents" ("retention_until")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_employee_document_last_downloaded_by"
      ON "employee_documents" ("last_downloaded_by_company_user_id")
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_employee_documents_last_downloaded_by'
            AND table_name = 'employee_documents'
        ) THEN
          ALTER TABLE "employee_documents"
            ADD CONSTRAINT "FK_employee_documents_last_downloaded_by"
            FOREIGN KEY ("last_downloaded_by_company_user_id")
            REFERENCES "company_users"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      DROP CONSTRAINT IF EXISTS "FK_employee_documents_last_downloaded_by"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_employee_document_last_downloaded_by"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_employee_document_retention_until"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      DROP COLUMN IF EXISTS "last_downloaded_by_company_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      DROP COLUMN IF EXISTS "last_downloaded_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      DROP COLUMN IF EXISTS "download_count"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      DROP COLUMN IF EXISTS "retention_until"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      DROP COLUMN IF EXISTS "metadata"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      DROP COLUMN IF EXISTS "classification"
    `);

    await queryRunner.query(`
      ALTER TABLE "auth_sessions"
      DROP CONSTRAINT IF EXISTS "FK_auth_sessions_company"
    `);
    await queryRunner.query(`
      ALTER TABLE "auth_sessions"
      DROP CONSTRAINT IF EXISTS "FK_auth_sessions_user"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_auth_session_refresh_expires"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_auth_session_user_active"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_auth_session_company"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_auth_session_user"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "auth_sessions"
    `);
  }
}
