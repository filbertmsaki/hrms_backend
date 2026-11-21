import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes room for AES-256-GCM ciphertext in bank account number columns.
 * Schema only: existing values are NOT encrypted here. Encryption of existing
 * rows is a separate, deliberate step (scripts/encrypt-bank-accounts.ts) run
 * only after keys, backups and recovery are verified for the environment.
 */
export class WidenEncryptedBankAccountColumns1797900045000 implements MigrationInterface {
  name = 'WidenEncryptedBankAccountColumns1797900045000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employee_bank_accounts" ALTER COLUMN "account_number" TYPE character varying(512)`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_payment_import_lines" ALTER COLUMN "account_number" TYPE character varying(512)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Refuse to truncate ciphertext: decrypt first (encrypt-bank-accounts.ts --decrypt).
    const rows = (await queryRunner.query(
      `SELECT
         (SELECT COUNT(*) FROM "employee_bank_accounts" WHERE "account_number" LIKE 'fenc:%')
       + (SELECT COUNT(*) FROM "payroll_payment_import_lines" WHERE "account_number" LIKE 'fenc:%')
         AS count`,
    )) as Array<{ count: number | string }>;
    if (Number(rows[0]?.count ?? 0) > 0) {
      throw new Error(
        'Encrypted bank account numbers exist. Run scripts/encrypt-bank-accounts.ts --decrypt before reverting.',
      );
    }
    await queryRunner.query(
      `ALTER TABLE "payroll_payment_import_lines" ALTER COLUMN "account_number" TYPE character varying(80)`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_bank_accounts" ALTER COLUMN "account_number" TYPE character varying(100)`,
    );
  }
}
