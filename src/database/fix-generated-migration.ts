import { promises as fs } from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

type MigrationFile = {
  filePath: string;
  name: string;
};

async function getLatestMigrationFile(): Promise<MigrationFile | null> {
  let files: string[] = [];
  try {
    files = await fs.readdir(MIGRATIONS_DIR);
  } catch {
    return null;
  }

  const candidates = files
    .filter((name) => /^\d+-.+\.(ts|js)$/.test(name))
    .sort((a, b) => {
      const ta = Number(a.split('-')[0]);
      const tb = Number(b.split('-')[0]);
      return tb - ta;
    });

  if (!candidates.length) {
    return null;
  }

  const name = candidates[0];
  return {
    name,
    filePath: path.join(MIGRATIONS_DIR, name),
  };
}

function buildSafeDropFk(
  originalLine: string,
  tableName: string,
  fkName: string,
): string {
  const indent = originalLine.match(/^(\s*)/)?.[1] ?? '';
  return (
    `${indent}const __hasTable_${tableName} = await queryRunner.query(` +
    '`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ' +
    `['${tableName}']);\n` +
    `${indent}if (__hasTable_${tableName}.length) {\n` +
    `${indent}  const __hasFk_${fkName} = await queryRunner.query(` +
    '`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ' +
    `['${tableName}', '${fkName}']);\n` +
    `${indent}  if (__hasFk_${fkName}.length) {\n` +
    `${indent}    ${originalLine.trim()}\n` +
    `${indent}  }\n` +
    `${indent}}`
  );
}

function patchMigrationContent(content: string): string {
  const regex =
    /(^\s*await queryRunner\.query\(`ALTER TABLE `([^`]+)` DROP FOREIGN KEY `([^`]+)`\);)/gm;

  let didPatch = false;
  const next = content.replace(regex, (full, line, tableName, fkName) => {
    didPatch = true;
    return buildSafeDropFk(line, tableName, fkName);
  });

  if (!didPatch) {
    return content;
  }

  return next;
}

async function main() {
  const migration = await getLatestMigrationFile();
  if (!migration) {
    console.log('No migration file found to patch.');
    return;
  }

  const raw = await fs.readFile(migration.filePath, 'utf8');
  const patched = patchMigrationContent(raw);

  if (patched === raw) {
    console.log(`No DROP FOREIGN KEY statements found in ${migration.name}.`);
    return;
  }

  await fs.writeFile(migration.filePath, patched, 'utf8');
  console.log(`Patched ${migration.name} with safe DROP FOREIGN KEY guards.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
