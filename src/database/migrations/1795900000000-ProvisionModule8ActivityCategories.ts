import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProvisionModule8ActivityCategories1795900000000 implements MigrationInterface {
  name = 'ProvisionModule8ActivityCategories1795900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "activity_categories" (
        "company_id", "code", "name", "description", "department_id",
        "position_id", "grade_id", "requires_time", "requires_outcome",
        "requires_evidence", "requires_location", "is_field_activity",
        "default_kpi_code", "display_order", "status", "version",
        "created_at", "updated_at"
      )
      SELECT company."id", category."code", category."name", NULL, NULL,
        NULL, NULL, false, true, false, false, false, NULL,
        category."display_order", 'ACTIVE', 1, now(), now()
      FROM "companies" company
      CROSS JOIN (VALUES
        ('SALES_VISIT', 'Sales visit', 1),
        ('CLIENT_MEETING', 'Client meeting', 2),
        ('RENEWAL_FOLLOW_UP', 'Renewal follow-up', 3),
        ('NEW_BUSINESS_LEAD', 'New business lead', 4),
        ('BROKER_INTERMEDIARY_VISIT', 'Broker/intermediary visit', 5),
        ('CLAIM_FOLLOW_UP', 'Claim follow-up', 6),
        ('UNDERWRITING_REVIEW', 'Underwriting review', 7),
        ('POLICY_ISSUANCE', 'Policy issuance', 8),
        ('CUSTOMER_SERVICE', 'Customer service', 9),
        ('COLLECTION_FOLLOW_UP', 'Collection follow-up', 10),
        ('TRAINING', 'Training', 11),
        ('INTERNAL_MEETING', 'Internal meeting', 12),
        ('BRANCH_OPERATIONS', 'Branch operations', 13),
        ('REPORT_PREPARATION', 'Report preparation', 14),
        ('COMPLIANCE_ACTIVITY', 'Compliance activity', 15),
        ('ADMINISTRATIVE_TASK', 'Administrative task', 16),
        ('SPECIAL_ASSIGNMENT', 'Special assignment', 17)
      ) AS category("code", "name", "display_order")
      WHERE NOT EXISTS (
        SELECT 1 FROM "activity_categories" existing
        WHERE existing."company_id" = company."id"
          AND upper(existing."code") = category."code"
      )
      ON CONFLICT ("company_id", "code") DO NOTHING
    `);
  }

  async down(): Promise<void> {
    // Canonical rows may already have history or administrator customizations.
    // Deliberately retain them on rollback rather than deleting tenant data.
  }
}
