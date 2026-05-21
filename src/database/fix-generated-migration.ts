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

// In TypeORM migration files, SQL identifiers are wrapped in backticks that are
// escaped as \` inside the JS template literal, so the raw file contains \`name\`.
// The regex \\\` matches that two-character sequence (backslash + backtick).
// [^\\`]+ matches the identifier itself (no backslash or backtick).

function buildSafeDropFk(
  originalLine: string,
  tableName: string,
  fkName: string,
): string {
  const indent = originalLine.match(/^(\s*)/)?.[1] ?? '';
  // Use fkName in the hasTable variable to avoid redeclaration when the same
  // table appears in multiple DROP FOREIGN KEY statements in one migration.
  return (
    `${indent}const __tbl_${fkName} = await queryRunner.query(` +
    '`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ' +
    `['${tableName}']);\n` +
    `${indent}if (__tbl_${fkName}.length) {\n` +
    `${indent}  const __hasFk_${fkName} = await queryRunner.query(` +
    '`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ' +
    `['${tableName}', '${fkName}']);\n` +
    `${indent}  if (__hasFk_${fkName}.length) {\n` +
    `${indent}    ${originalLine.trim()}\n` +
    `${indent}  }\n` +
    `${indent}}`
  );
}

function buildSafeAddFk(
  originalLine: string,
  tableName: string,
  fkName: string,
): string {
  const indent = originalLine.match(/^(\s*)/)?.[1] ?? '';
  return (
    `${indent}const __hasFkAdd_${fkName} = await queryRunner.query(` +
    '`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ' +
    `['${tableName}', '${fkName}']);\n` +
    `${indent}if (!__hasFkAdd_${fkName}.length) {\n` +
    `${indent}  ${originalLine.trim()}\n` +
    `${indent}}`
  );
}

function patchMigrationContent(content: string): string {
  // Matches: await queryRunner.query(`ALTER TABLE \`table\` DROP FOREIGN KEY \`FK_name\``);
  const dropRegex =
    /(^\s*await queryRunner\.query\(`ALTER TABLE \\\`([^\\`]+)\\\` DROP FOREIGN KEY \\\`([^\\`]+)\\\``\);)/gm;

  // Matches: await queryRunner.query(`ALTER TABLE \`table\` ADD CONSTRAINT \`FK_name\` FOREIGN KEY ...`);
  const addRegex =
    /(^\s*await queryRunner\.query\(`ALTER TABLE \\\`([^\\`]+)\\\` ADD CONSTRAINT \\\`([^\\`]+)\\\` FOREIGN KEY .+`\);)/gm;

  let didPatch = false;

  let next = content.replace(dropRegex, (full, line, tableName, fkName) => {
    didPatch = true;
    return buildSafeDropFk(line, tableName, fkName);
  });

  next = next.replace(addRegex, (full, line, tableName, fkName) => {
    didPatch = true;
    return buildSafeAddFk(line, tableName, fkName);
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
    console.log(`No FOREIGN KEY statements found to patch in ${migration.name}.`);
    return;
  }

  await fs.writeFile(migration.filePath, patched, 'utf8');
  console.log(`Patched ${migration.name} with safe FOREIGN KEY guards.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
