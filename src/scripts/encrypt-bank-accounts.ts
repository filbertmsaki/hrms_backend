/**
 * Encrypts (or, with --decrypt, decrypts) existing bank account numbers.
 *
 * Deliberate, operator-run step. It is NOT part of migrations. Before running
 * it against an environment:
 *   1. Configure keys (KMS-installed or FIELD_ENCRYPTION_KEYS /
 *      FIELD_ENCRYPTION_ACTIVE_KEY) and store them in the secret manager.
 *   2. Take a database backup and prove a restore works.
 *   3. Prove decryption works on a restored copy (run with --verify).
 *
 * Usage (from backend/):
 *   npm run payroll:bank-accounts:encrypt -- --dry-run   (deployed build)
 *   npm run payroll:bank-accounts:encrypt:source -- --dry-run   (from source)
 *   modes: --dry-run | --apply | --verify | --decrypt --apply
 *
 * Also re-encrypts values written under an older key version (rotation).
 * Output is counts only; no account number is ever printed.
 */
import { AppDataSource } from '../database/data-source';
import {
  activeFieldKeyVersion,
  decryptField,
  encryptField,
  fieldKeyVersion,
  isEncryptedField,
  isFieldEncryptionEnabled,
} from '../common/crypto/field-encryption';

const TARGETS = [
  {
    table: 'employee_bank_accounts',
    context: 'employee_bank_accounts.account_number',
  },
  {
    table: 'payroll_payment_import_lines',
    context: 'payroll_payment_import_lines.account_number',
  },
];

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const verify = args.has('--verify');
  const decrypt = args.has('--decrypt');
  if (!apply && !verify && !args.has('--dry-run')) {
    throw new Error('Pass --dry-run, --verify or --apply.');
  }
  if (!decrypt && !isFieldEncryptionEnabled()) {
    throw new Error(
      'Set FIELD_ENCRYPTION_ENABLED=true and configure encryption keys first.',
    );
  }
  const active = activeFieldKeyVersion();
  // Schema-free connection: raw SQL bypasses entity transformers on purpose.
  const ds = await AppDataSource.setOptions({
    entities: [],
    migrations: [],
    logging: false,
  } as never).initialize();
  try {
    for (const target of TARGETS) {
      const rows: Array<{ id: number; account_number: string | null }> =
        await ds.query(
          `SELECT id, account_number FROM "${target.table}" WHERE account_number IS NOT NULL AND account_number <> ''`,
        );
      let changed = 0;
      let failed = 0;
      let unchanged = 0;
      await ds.transaction(async (manager) => {
        for (const row of rows) {
          const value = row.account_number!;
          try {
            if (verify) {
              if (isEncryptedField(value)) decryptField(value, target.context);
              unchanged += 1;
              continue;
            }
            let next: string | null = null;
            if (decrypt) {
              if (isEncryptedField(value))
                next = decryptField(value, target.context);
            } else if (!isEncryptedField(value)) {
              next = encryptField(value, target.context);
            } else if (fieldKeyVersion(value) !== active) {
              next = encryptField(
                decryptField(value, target.context),
                target.context,
              );
            }
            if (next === null) {
              unchanged += 1;
              continue;
            }
            // Self-check before writing: the new value must read back.
            const roundTrip = isEncryptedField(next)
              ? decryptField(next, target.context)
              : next;
            const original = isEncryptedField(value)
              ? decryptField(value, target.context)
              : value;
            if (roundTrip !== original) throw new Error('round-trip mismatch');
            if (apply) {
              await manager.query(
                `UPDATE "${target.table}" SET account_number = $1 WHERE id = $2`,
                [next, row.id],
              );
            }
            changed += 1;
          } catch {
            failed += 1;
          }
        }
        if (failed > 0 && apply) {
          throw new Error(
            `${target.table}: ${failed} row(s) failed; transaction rolled back.`,
          );
        }
      });
      console.log(
        JSON.stringify({
          table: target.table,
          mode: verify ? 'verify' : apply ? 'apply' : 'dry-run',
          direction: decrypt ? 'decrypt' : 'encrypt',
          active_key: active,
          rows: rows.length,
          [verify ? 'verified' : apply ? 'updated' : 'would_update']: verify
            ? unchanged
            : changed,
          unchanged: verify ? 0 : unchanged,
          failed,
        }),
      );
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Failed.');
  process.exit(1);
});
