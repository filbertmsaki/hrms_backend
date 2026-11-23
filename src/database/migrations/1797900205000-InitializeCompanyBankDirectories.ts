import { MigrationInterface, QueryRunner } from 'typeorm';
import { initializeCompanyBankDirectory } from '../migration-helpers/company-bank-directory-1797900205000';

export class InitializeCompanyBankDirectories1797900205000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await initializeCompanyBankDirectory(runner.manager);
  }

  async down(): Promise<void> {
    // Both application versions read these ordinary directory rows.
    // Preserve administrator edits and the initialization marker on downgrade.
  }
}
