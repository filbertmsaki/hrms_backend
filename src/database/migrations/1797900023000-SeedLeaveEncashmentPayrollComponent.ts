import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the LEAVE_ENCASHMENT payroll component (taxable one-time earning) to
 * every company that already has payroll components, so approved leave
 * encashments handed to payroll get a defined tax treatment. Companies that
 * already configured the code keep their own settings.
 */
export class SeedLeaveEncashmentPayrollComponent1797900023000 implements MigrationInterface {
  name = 'SeedLeaveEncashmentPayrollComponent1797900023000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO "payroll_components" (
        "company_id", "code", "name", "component_type", "frequency",
        "calculation_method", "tax_treatment", "taxable_percentage",
        "pensionable", "health_insurance_applicable", "included_in_gross",
        "included_in_net", "included_in_employer_cost", "subject_to_proration",
        "allow_manual_input", "allow_negative_amount", "calculation_order",
        "general_ledger_account_code", "liability_account_code",
        "expense_account_code", "is_system_component", "status", "version"
      )
      SELECT DISTINCT pc."company_id", 'LEAVE_ENCASHMENT', 'Leave encashment',
        'EARNING'::"payroll_component_type_enum",
        'ONE_TIME'::"payroll_component_frequency_enum",
        'EXTERNAL_INPUT'::"payroll_calculation_method_enum",
        'TAXABLE'::"payroll_tax_treatment_enum", 100,
        false, false, true, true, true, false, true, false, 55,
        '5045-LEAVE-ENCASHMENT', '2100-PAYROLL-CLEARING',
        '5045-LEAVE-ENCASHMENT', false, 'ACTIVE', 1
      FROM "payroll_components" pc
      WHERE NOT EXISTS (
        SELECT 1 FROM "payroll_components" x
        WHERE x."company_id" = pc."company_id" AND x."code" = 'LEAVE_ENCASHMENT'
      )
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    // Only remove rows this migration could have added and nothing uses yet.
    await q.query(`
      DELETE FROM "payroll_components" c
      WHERE c."code" = 'LEAVE_ENCASHMENT'
        AND c."general_ledger_account_code" = '5045-LEAVE-ENCASHMENT'
        AND NOT EXISTS (
          SELECT 1 FROM "payroll_inputs" i
          WHERE i."company_id" = c."company_id"
            AND i."component_code" = 'LEAVE_ENCASHMENT'
        )
    `);
  }
}
