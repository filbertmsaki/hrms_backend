import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotifications1786205000000 implements MigrationInterface {
  name = 'CreateNotifications1786205000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "sender_company_user_id" integer,
        "receiver_company_user_id" integer NOT NULL,
        "type" character varying(80) NOT NULL DEFAULT 'GENERAL',
        "title" character varying(180) NOT NULL,
        "message" text NOT NULL,
        "entity_type" character varying(80),
        "entity_id" character varying(80),
        "action_url" character varying(500),
        "metadata" json,
        "status" character varying(20) NOT NULL DEFAULT 'UNREAD',
        "read_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD CONSTRAINT "FK_notifications_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD CONSTRAINT "FK_notifications_sender_company_user"
      FOREIGN KEY ("sender_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD CONSTRAINT "FK_notifications_receiver_company_user"
      FOREIGN KEY ("receiver_company_user_id") REFERENCES "company_users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_company_receiver"
      ON "notifications" ("company_id", "receiver_company_user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_status"
      ON "notifications" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_type"
      ON "notifications" ("type")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_entity"
      ON "notifications" ("entity_type", "entity_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_entity"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_type"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notifications_company_receiver"`,
    );

    await queryRunner.query(`
      ALTER TABLE "notifications"
      DROP CONSTRAINT "FK_notifications_receiver_company_user"
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
      DROP CONSTRAINT "FK_notifications_sender_company_user"
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
      DROP CONSTRAINT "FK_notifications_company"
    `);

    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
