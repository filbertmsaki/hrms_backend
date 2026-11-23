import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyOidc1797900103000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`CREATE TABLE oidc_providers (
      company_id integer PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      issuer text NOT NULL, client_id text NOT NULL, secret_ciphertext text NOT NULL,
      revision uuid NOT NULL, enabled boolean NOT NULL DEFAULT false, tested_at timestamptz)`);
    await runner.query(`CREATE TABLE oidc_requests (
      state_hash varchar(64) PRIMARY KEY, browser_hash varchar(64) NOT NULL,
      company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE, revision uuid NOT NULL,
      purpose varchar(8) NOT NULL, session_id uuid, user_id integer REFERENCES users(id) ON DELETE CASCADE,
      verifier text NOT NULL, nonce text NOT NULL, expires_at timestamptz NOT NULL)`);
    await runner.query(
      'CREATE INDEX "IDX_oidc_request_expiry" ON oidc_requests (expires_at)',
    );
    await runner.query(`CREATE TABLE oidc_identities (
      company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, issuer text NOT NULL,
      client_id text NOT NULL, subject text NOT NULL, PRIMARY KEY(company_id,user_id),
      CONSTRAINT "UQ_oidc_subject" UNIQUE (company_id,issuer,client_id,subject))`);
  }
  async down(runner: QueryRunner) {
    await runner.query('DROP TABLE oidc_identities');
    await runner.query('DROP TABLE oidc_requests');
    await runner.query('DROP TABLE oidc_providers');
  }
}
