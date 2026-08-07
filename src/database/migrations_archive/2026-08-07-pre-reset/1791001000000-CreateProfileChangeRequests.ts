import { MigrationInterface, QueryRunner } from 'typeorm';

const PROFILE_CHANGE_PERMISSIONS = [
  {
    name: 'profile_change_request.view_all',
    displayName: 'View profile change requests',
    description: 'Allow listing profile change requests for HR review',
  },
  {
    name: 'profile_change_request.review',
    displayName: 'Start profile change review',
    description: 'Allow starting review of employee profile change requests',
  },
  {
    name: 'profile_change_request.approve',
    displayName: 'Approve profile changes',
    description: 'Allow approving employee profile change requests',
  },
  {
    name: 'profile_change_request.reject',
    displayName: 'Reject profile changes',
    description: 'Allow rejecting employee profile change requests',
  },
  {
    name: 'profile_change_request.request_correction',
    displayName: 'Request profile change correction',
    description:
      'Allow returning employee profile change requests for correction',
  },
  {
    name: 'profile_change_request.view_audit',
    displayName: 'View profile change audit',
    description:
      'Allow viewing audit history for employee profile change requests',
  },
  {
    name: 'profile_change_request.view_pending_files',
    displayName: 'View pending profile change files',
    description:
      'Allow previewing pending files attached to employee profile change requests',
  },
] as const;

const PROFILE_CHANGE_ROLE_BACKFILL: Record<string, string[]> = {
  COMPANY_ADMIN: PROFILE_CHANGE_PERMISSIONS.map(
    (permission) => permission.name,
  ),
  HR_MANAGER: PROFILE_CHANGE_PERMISSIONS.map((permission) => permission.name),
  HR_OFFICER: PROFILE_CHANGE_PERMISSIONS.map((permission) => permission.name),
};

export class CreateProfileChangeRequests1791001000000 implements MigrationInterface {
  name = 'CreateProfileChangeRequests1791001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'profile_change_requests_request_type_enum'
        ) THEN
          CREATE TYPE "profile_change_requests_request_type_enum" AS ENUM (
            'PROFILE_PHOTO',
            'PERSONAL_INFORMATION',
            'CONTACT_INFORMATION',
            'ADDRESS_INFORMATION',
            'EMERGENCY_CONTACT',
            'OTHER_PROFILE_INFORMATION'
          );
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'profile_change_requests_status_enum'
        ) THEN
          CREATE TYPE "profile_change_requests_status_enum" AS ENUM (
            'DRAFT',
            'PENDING_REVIEW',
            'UNDER_REVIEW',
            'CORRECTION_REQUIRED',
            'APPROVED',
            'REJECTED',
            'CANCELLED',
            'SUPERSEDED'
          );
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'profile_change_request_items_source_entity_enum'
        ) THEN
          CREATE TYPE "profile_change_request_items_source_entity_enum" AS ENUM (
            'user',
            'employee',
            'employee_contact',
            'employee_address',
            'employee_relative'
          );
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'profile_change_request_items_status_enum'
        ) THEN
          CREATE TYPE "profile_change_request_items_status_enum" AS ENUM (
            'PENDING',
            'APPLIED',
            'REJECTED',
            'CONFLICTED'
          );
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'profile_change_request_items_validation_status_enum'
        ) THEN
          CREATE TYPE "profile_change_request_items_validation_status_enum" AS ENUM (
            'PENDING',
            'VALID',
            'INVALID',
            'CONFLICTED'
          );
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'profile_change_request_files_file_purpose_enum'
        ) THEN
          CREATE TYPE "profile_change_request_files_file_purpose_enum" AS ENUM (
            'PROPOSED_PROFILE_PHOTO'
          );
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'profile_change_request_files_status_enum'
        ) THEN
          CREATE TYPE "profile_change_request_files_status_enum" AS ENUM (
            'PENDING',
            'APPROVED',
            'REJECTED',
            'REMOVED'
          );
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'profile_change_request_audits_action_enum'
        ) THEN
          CREATE TYPE "profile_change_request_audits_action_enum" AS ENUM (
            'REQUEST_CREATED',
            'DRAFT_UPDATED',
            'VALIDATION_PERFORMED',
            'REQUEST_SUBMITTED',
            'FILE_UPLOADED',
            'REVIEW_STARTED',
            'CORRECTION_REQUESTED',
            'REQUEST_RESUBMITTED',
            'REQUEST_APPROVED',
            'REQUEST_REJECTED',
            'REQUEST_CANCELLED',
            'REQUEST_SUPERSEDED',
            'CONFLICT_DETECTED',
            'PROFILE_PUBLISHED',
            'FILE_PROMOTED',
            'PENDING_FILE_REMOVED',
            'NOTIFICATION_CREATED',
            'NOTIFICATION_FAILED'
          );
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'profile_change_request_audits_previous_status_enum'
        ) THEN
          CREATE TYPE "profile_change_request_audits_previous_status_enum" AS ENUM (
            'DRAFT',
            'PENDING_REVIEW',
            'UNDER_REVIEW',
            'CORRECTION_REQUIRED',
            'APPROVED',
            'REJECTED',
            'CANCELLED',
            'SUPERSEDED'
          );
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'profile_change_request_audits_new_status_enum'
        ) THEN
          CREATE TYPE "profile_change_request_audits_new_status_enum" AS ENUM (
            'DRAFT',
            'PENDING_REVIEW',
            'UNDER_REVIEW',
            'CORRECTION_REQUIRED',
            'APPROVED',
            'REJECTED',
            'CANCELLED',
            'SUPERSEDED'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "profile_change_requests" (
        "id" SERIAL NOT NULL,
        "reference_number" character varying(50) NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "requested_by_user_id" integer NOT NULL,
        "request_type" "profile_change_requests_request_type_enum" NOT NULL,
        "status" "profile_change_requests_status_enum" NOT NULL DEFAULT 'DRAFT',
        "submitted_at" TIMESTAMP,
        "review_started_at" TIMESTAMP,
        "reviewed_by_user_id" integer,
        "reviewed_at" TIMESTAMP,
        "approved_at" TIMESTAMP,
        "rejected_at" TIMESTAMP,
        "cancelled_at" TIMESTAMP,
        "correction_requested_at" TIMESTAMP,
        "reason" text,
        "review_comment" text,
        "rejection_reason" text,
        "correction_instructions" text,
        "version" integer NOT NULL DEFAULT 1,
        "metadata" json,
        "deleted_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profile_change_requests_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_profile_change_requests_employee_id"
          FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_profile_change_requests_requested_by_user_id"
          FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_profile_change_requests_reviewed_by_user_id"
          FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_profile_change_requests_reference"
      ON "profile_change_requests" ("reference_number")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_profile_change_requests_company_status"
      ON "profile_change_requests" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_profile_change_requests_employee_created"
      ON "profile_change_requests" ("employee_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_profile_change_requests_type"
      ON "profile_change_requests" ("request_type")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_profile_change_requests_submitted"
      ON "profile_change_requests" ("submitted_at")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "profile_change_request_items" (
        "id" SERIAL NOT NULL,
        "request_id" integer NOT NULL,
        "field_name" character varying(100) NOT NULL,
        "field_label" character varying(150) NOT NULL,
        "source_entity" "profile_change_request_items_source_entity_enum" NOT NULL,
        "old_value" text,
        "new_value" text,
        "value_type" character varying(50) NOT NULL,
        "status" "profile_change_request_items_status_enum" NOT NULL DEFAULT 'PENDING',
        "validation_status" "profile_change_request_items_validation_status_enum" NOT NULL DEFAULT 'PENDING',
        "validation_errors" json,
        "sensitive" boolean NOT NULL DEFAULT false,
        "review_comment" text,
        "reviewed_by_user_id" integer,
        "reviewed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profile_change_request_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_profile_change_request_items_request_id"
          FOREIGN KEY ("request_id") REFERENCES "profile_change_requests"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_profile_change_request_items_reviewed_by_user_id"
          FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_profile_change_request_items_request"
      ON "profile_change_request_items" ("request_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_profile_change_request_items_field"
      ON "profile_change_request_items" ("field_name")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "profile_change_request_files" (
        "id" SERIAL NOT NULL,
        "request_id" integer NOT NULL,
        "file_purpose" "profile_change_request_files_file_purpose_enum" NOT NULL,
        "status" "profile_change_request_files_status_enum" NOT NULL DEFAULT 'PENDING',
        "storage_visibility" character varying(30) NOT NULL DEFAULT 'private',
        "file_path" text NOT NULL,
        "original_file_name" character varying(255) NOT NULL,
        "stored_file_name" character varying(255) NOT NULL,
        "file_extension" character varying(20) NOT NULL,
        "mime_type" character varying(100) NOT NULL,
        "file_size" integer NOT NULL,
        "width" integer,
        "height" integer,
        "uploaded_by_user_id" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profile_change_request_files_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_profile_change_request_files_request_id"
          FOREIGN KEY ("request_id") REFERENCES "profile_change_requests"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_profile_change_request_files_uploaded_by_user_id"
          FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_profile_change_request_files_request"
      ON "profile_change_request_files" ("request_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "profile_change_request_audits" (
        "id" SERIAL NOT NULL,
        "request_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "company_id" integer NOT NULL,
        "branch_id" integer,
        "action" "profile_change_request_audits_action_enum" NOT NULL,
        "previous_status" "profile_change_request_audits_previous_status_enum",
        "new_status" "profile_change_request_audits_new_status_enum",
        "actor_user_id" integer,
        "actor_employee_id" integer,
        "actor_role" character varying(100),
        "ip_address" character varying(45),
        "user_agent" text,
        "request_id_header" character varying(255),
        "metadata" json,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profile_change_request_audits_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_profile_change_request_audits_request_id"
          FOREIGN KEY ("request_id") REFERENCES "profile_change_requests"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_profile_change_request_audits_request"
      ON "profile_change_request_audits" ("request_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_profile_change_request_audits_employee"
      ON "profile_change_request_audits" ("employee_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_profile_change_request_audits_company"
      ON "profile_change_request_audits" ("company_id")
    `);

    for (const permission of PROFILE_CHANGE_PERMISSIONS) {
      await queryRunner.query(
        `
          INSERT INTO "permissions" (
            "name",
            "display_name",
            "description",
            "is_system_generated",
            "created_at",
            "updated_at"
          )
          VALUES ($1, $2, $3, true, now(), now())
          ON CONFLICT ("name")
          DO UPDATE
          SET
            "display_name" = EXCLUDED."display_name",
            "description" = EXCLUDED."description",
            "is_system_generated" = true,
            "updated_at" = now()
        `,
        [permission.name, permission.displayName, permission.description],
      );
    }

    for (const [roleName, permissionNames] of Object.entries(
      PROFILE_CHANGE_ROLE_BACKFILL,
    )) {
      await queryRunner.query(
        `
          INSERT INTO "permission_role" ("rolesId", "permissionsId")
          SELECT DISTINCT role.id, permission.id
          FROM "roles" role
          INNER JOIN "permissions" permission
            ON permission."name" = ANY($2)
          WHERE role."name" = $1
            AND role."company_id" IS NOT NULL
          ON CONFLICT ("rolesId", "permissionsId") DO NOTHING
        `,
        [roleName, permissionNames],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const roleNames = Object.keys(PROFILE_CHANGE_ROLE_BACKFILL);
    const permissionNames = PROFILE_CHANGE_PERMISSIONS.map(
      (permission) => permission.name,
    );

    await queryRunner.query(
      `
        DELETE FROM "permission_role" pr
        USING "roles" role, "permissions" permission
        WHERE pr."rolesId" = role."id"
          AND pr."permissionsId" = permission."id"
          AND role."company_id" IS NOT NULL
          AND role."name" = ANY($1)
          AND permission."name" = ANY($2)
      `,
      [roleNames, permissionNames],
    );

    await queryRunner.query(
      `
        DELETE FROM "permissions" permission
        WHERE permission."name" = ANY($1)
          AND NOT EXISTS (
            SELECT 1
            FROM "permission_role" pr
            WHERE pr."permissionsId" = permission."id"
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "permission_user" pu
            WHERE pu."permissionsId" = permission."id"
          )
      `,
      [permissionNames],
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_profile_change_request_audits_company"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_profile_change_request_audits_employee"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_profile_change_request_audits_request"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "profile_change_request_audits"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_profile_change_request_files_request"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "profile_change_request_files"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_profile_change_request_items_field"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_profile_change_request_items_request"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "profile_change_request_items"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_profile_change_requests_submitted"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_profile_change_requests_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_profile_change_requests_employee_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_profile_change_requests_company_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_profile_change_requests_reference"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "profile_change_requests"`);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "profile_change_request_audits_new_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "profile_change_request_audits_previous_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "profile_change_request_audits_action_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "profile_change_request_files_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "profile_change_request_files_file_purpose_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "profile_change_request_items_validation_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "profile_change_request_items_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "profile_change_request_items_source_entity_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "profile_change_requests_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "profile_change_requests_request_type_enum"`,
    );
  }
}
