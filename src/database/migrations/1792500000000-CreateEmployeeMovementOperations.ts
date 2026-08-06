import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmployeeMovementOperations1792500000000
  implements MigrationInterface
{
  name = 'CreateEmployeeMovementOperations1792500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "employee_movement_operations" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "movement_id" integer NOT NULL,
        "operation_type" varchar(60) NOT NULL,
        "resource_key" varchar(200) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "payload" jsonb,
        "result" jsonb,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "last_error" text,
        "completed_at" timestamptz,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_employee_movement_operations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_movement_operation_resource" UNIQUE (
          "movement_id", "operation_type", "resource_key"
        ),
        CONSTRAINT "FK_movement_operation_movement" FOREIGN KEY ("movement_id")
          REFERENCES "employee_movements"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_movement_operation_company_status"
      ON "employee_movement_operations" ("company_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_movement_operations"`);
  }
}
