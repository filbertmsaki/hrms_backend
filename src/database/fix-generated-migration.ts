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

// In TypeORM migration files generated for PostgreSQL, SQL identifiers are
// wrapped in double-quotes escaped as \" inside the JS template literal, so
// the raw file contains \"name\". The regex \\\\" matches that two-character
// sequence (backslash + double-quote). [^\\"]+ matches the identifier itself.

function buildSafeDropFk(
  originalLine: string,
  tableName: string,
  fkName: string,
): string {
  const indent = originalLine.match(/^(\s*)/)?.[1] ?? '';
  return (
    `${indent}const __tbl_${fkName} = await queryRunner.query(` +
    `\`SELECT 1 FROM information_schema.tables WHERE table_catalog = current_database() AND table_name = $1 LIMIT 1\`, ` +
    `['${tableName}']);\n` +
    `${indent}if (__tbl_${fkName}.length) {\n` +
    `${indent}  const __hasFk_${fkName} = await queryRunner.query(` +
    `\`SELECT 1 FROM information_schema.table_constraints WHERE table_catalog = current_database() AND table_name = $1 AND constraint_name = $2 LIMIT 1\`, ` +
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
    `\`SELECT 1 FROM information_schema.table_constraints WHERE table_catalog = current_database() AND table_name = $1 AND constraint_name = $2 LIMIT 1\`, ` +
    `['${tableName}', '${fkName}']);\n` +
    `${indent}if (!__hasFkAdd_${fkName}.length) {\n` +
    `${indent}  ${originalLine.trim()}\n` +
    `${indent}}`
  );
}

function patchMigrationContent(content: string): string {
  // Matches PostgreSQL-style: await queryRunner.query(`ALTER TABLE "table" DROP CONSTRAINT "FK_name"`);
  const dropRegex =
    /(^\s*await queryRunner\.query\(`ALTER TABLE \\"([^"\\]+)\\" DROP CONSTRAINT \\"([^"\\]+)\\"`\);)/gm;

  // Matches PostgreSQL-style: await queryRunner.query(`ALTER TABLE "table" ADD CONSTRAINT "FK_name" FOREIGN KEY ...`);
  const addRegex =
    /(^\s*await queryRunner\.query\(`ALTER TABLE \\"([^"\\]+)\\" ADD CONSTRAINT \\"([^"\\]+)\\" FOREIGN KEY .+`\);)/gm;

  let didPatch = false;

  let next = content.replace(
    dropRegex,
    (full: string, line: string, tableName: string, fkName: string) => {
      didPatch = true;
      return buildSafeDropFk(line, tableName, fkName);
    },
  );

  next = next.replace(
    addRegex,
    (full: string, line: string, tableName: string, fkName: string) => {
      didPatch = true;
      return buildSafeAddFk(line, tableName, fkName);
    },
  );

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
    console.log(
      `No FOREIGN KEY statements found to patch in ${migration.name}.`,
    );
    return;
  }

  await fs.writeFile(migration.filePath, patched, 'utf8');
  console.log(`Patched ${migration.name} with safe FOREIGN KEY guards.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
