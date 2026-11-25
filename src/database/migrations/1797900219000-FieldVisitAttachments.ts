import { MigrationInterface, QueryRunner } from 'typeorm';

export class FieldVisitAttachments1797900219000 implements MigrationInterface {
  name = 'FieldVisitAttachments1797900219000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE IF NOT EXISTS "field_visit_attachments" ("id" SERIAL PRIMARY KEY, "company_id" integer NOT NULL, "field_visit_id" integer NOT NULL, "employee_id" integer NOT NULL, "file_name" varchar(255) NOT NULL, "mime_type" varchar(150) NOT NULL, "file_size" integer NOT NULL, "file_path" text NOT NULL, "description" text, "created_at" timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_field_visit_attachment_visit" ON "field_visit_attachments" ("company_id", "field_visit_id")`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "field_visit_attachments"`);
  }
}
