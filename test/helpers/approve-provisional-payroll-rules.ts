import type { DataSource } from 'typeorm';

/** Approves the explicitly provisional payroll seed only in e2e fixtures. */
export async function approveProvisionalPayrollRules(
  dataSource: DataSource,
  companyId: number,
  approvedByCompanyUserId: number,
): Promise<void> {
  await dataSource.query(
    `UPDATE "statutory_rule_versions"
     SET "status" = 'APPROVED',
         "approved_by_company_user_id" = $2,
         "approved_at" = NOW()
     WHERE "company_id" = $1
       AND "status" = 'DRAFT'
       AND "effective_to" IS NULL
       AND "configuration"->>'source' = '038-payroll-baseline'
       AND "configuration"->>'provisional' = 'true'`,
    [companyId, approvedByCompanyUserId],
  );
}
