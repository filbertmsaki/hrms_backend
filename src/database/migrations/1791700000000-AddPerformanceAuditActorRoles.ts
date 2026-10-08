import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceAuditActorRoles1791700000000 implements MigrationInterface {
  name = 'AddPerformanceAuditActorRoles1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "performance_audit_logs" ADD COLUMN "actor_roles" text[] NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `CREATE FUNCTION performance_audit_append_only() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Performance audit logs are append-only'; END; $$ LANGUAGE plpgsql`,
    );
    await queryRunner.query(
      `CREATE TRIGGER performance_audit_append_only_guard BEFORE UPDATE OR DELETE ON "performance_audit_logs" FOR EACH ROW EXECUTE FUNCTION performance_audit_append_only()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER performance_audit_append_only_guard ON "performance_audit_logs"`,
    );
    await queryRunner.query(`DROP FUNCTION performance_audit_append_only()`);
    await queryRunner.query(
      `ALTER TABLE "performance_audit_logs" DROP COLUMN "actor_roles"`,
    );
  }
}
