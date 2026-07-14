import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRoleAuditLogs1786306000000 implements MigrationInterface {
  name = 'CreateRoleAuditLogs1786306000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."role_audit_logs_action_enum" AS ENUM('PERMISSION_ASSIGNED', 'PERMISSION_REVOKED')
    `);

    await queryRunner.query(`
      CREATE TABLE "role_audit_logs" (
        "id" SERIAL NOT NULL,
        "role_id" integer,
        "permission_id" integer,
        "actor_company_user_id" integer,
        "action" "public"."role_audit_logs_action_enum" NOT NULL,
        "description" text,
        "old_values" json,
        "new_values" json,
        "metadata" json,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_role_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "role_audit_logs"
      ADD CONSTRAINT "FK_role_audit_logs_role"
      FOREIGN KEY ("role_id") REFERENCES "roles"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "role_audit_logs"
      ADD CONSTRAINT "FK_role_audit_logs_permission"
      FOREIGN KEY ("permission_id") REFERENCES "permissions"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "role_audit_logs"
      ADD CONSTRAINT "FK_role_audit_logs_actor_company_user"
      FOREIGN KEY ("actor_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_role_audit_role" ON "role_audit_logs" ("role_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_role_audit_action" ON "role_audit_logs" ("action")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_role_audit_action"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_role_audit_role"`);

    await queryRunner.query(`
      ALTER TABLE "role_audit_logs"
      DROP CONSTRAINT "FK_role_audit_logs_actor_company_user"
    `);

    await queryRunner.query(`
      ALTER TABLE "role_audit_logs"
      DROP CONSTRAINT "FK_role_audit_logs_permission"
    `);

    await queryRunner.query(`
      ALTER TABLE "role_audit_logs"
      DROP CONSTRAINT "FK_role_audit_logs_role"
    `);

    await queryRunner.query(`DROP TABLE "role_audit_logs"`);

    await queryRunner.query(`
      DROP TYPE "public"."role_audit_logs_action_enum"
    `);
  }
}
