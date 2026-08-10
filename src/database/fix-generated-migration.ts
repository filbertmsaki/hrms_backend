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

function dedupeSharedEnumStatements(content: string): string {
  const createTypeRegex =
    /^(\s*)await queryRunner\.query\(`CREATE TYPE "public"\."([^"]+)" AS ENUM\(.+`\);$/gm;
  const dropTypeRegex =
    /^(\s*)await queryRunner\.query\(`DROP TYPE "public"\."([^"]+)"`\);$/gm;

  const createMatches = Array.from(content.matchAll(createTypeRegex));
  const dropMatches = Array.from(content.matchAll(dropTypeRegex));

  const createCounts = new Map<string, number>();
  const dropCounts = new Map<string, number>();

  for (const match of createMatches) {
    const enumName = match[2];
    createCounts.set(enumName, (createCounts.get(enumName) ?? 0) + 1);
  }

  for (const match of dropMatches) {
    const enumName = match[2];
    dropCounts.set(enumName, (dropCounts.get(enumName) ?? 0) + 1);
  }

  const seenCreates = new Map<string, number>();
  let next = content.replace(
    createTypeRegex,
    (full: string, indent: string, enumName: string) => {
      const total = createCounts.get(enumName) ?? 0;
      const seen = (seenCreates.get(enumName) ?? 0) + 1;
      seenCreates.set(enumName, seen);

      if (total <= 1 || seen === 1) {
        return full;
      }

      return `${indent}// Deduped duplicate CREATE TYPE for "${enumName}"`;
    },
  );

  const seenDrops = new Map<string, number>();
  next = next.replace(
    dropTypeRegex,
    (full: string, indent: string, enumName: string) => {
      const total = dropCounts.get(enumName) ?? 0;
      const seen = (seenDrops.get(enumName) ?? 0) + 1;
      seenDrops.set(enumName, seen);

      if (total <= 1 || seen === total) {
        return full;
      }

      return `${indent}// Deduped duplicate DROP TYPE for "${enumName}"`;
    },
  );

  return next;
}

function ensureRequiredSchemas(content: string): string {
  const createSchemaRegex =
    /^\s*await queryRunner\.query\(`CREATE SCHEMA IF NOT EXISTS "([^"]+)"`\);$/gm;
  const schemaReferenceRegex =
    /await queryRunner\.query\(`CREATE (?:TYPE|TABLE|INDEX) "([^"]+)"\."[^"]+"/gm;
  const upMethodRegex =
    /(public async up\(queryRunner: QueryRunner\): Promise<void> \{\r?\n)/;

  const existingSchemas = new Set(
    Array.from(content.matchAll(createSchemaRegex), (match) => match[1]),
  );
  const requiredSchemas = Array.from(
    new Set(
      Array.from(content.matchAll(schemaReferenceRegex), (match) => match[1]),
    ),
  )
    .filter((schemaName) => schemaName !== 'public')
    .filter((schemaName) => !existingSchemas.has(schemaName))
    .sort();

  if (!requiredSchemas.length) {
    return content;
  }

  const schemaLines = requiredSchemas
    .map(
      (schemaName) =>
        `        await queryRunner.query(\`CREATE SCHEMA IF NOT EXISTS "${schemaName}"\`);`,
    )
    .join('\n');

  return content.replace(upMethodRegex, `$1${schemaLines}\n`);
}

function patchMigrationContent(content: string): string {
  // Matches PostgreSQL-style: await queryRunner.query(`ALTER TABLE "table" DROP CONSTRAINT "FK_name"`);
  const dropRegex =
    /(^\s*await queryRunner\.query\(`ALTER TABLE "([^"]+)" DROP CONSTRAINT "([^"]+)"`\);)/gm;

  // Matches PostgreSQL-style: await queryRunner.query(`ALTER TABLE "table" ADD CONSTRAINT "FK_name" FOREIGN KEY ...`);
  const addRegex =
    /(^\s*await queryRunner\.query\(`ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" FOREIGN KEY .+`\);)/gm;

  let didPatch = false;
  let next = ensureRequiredSchemas(content);
  if (next !== content) {
    didPatch = true;
  }

  const deduped = dedupeSharedEnumStatements(next);
  if (deduped !== next) {
    didPatch = true;
    next = deduped;
  }

  next = next.replace(
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
    console.log(`No migration patches were needed in ${migration.name}.`);
    return;
  }

  await fs.writeFile(migration.filePath, patched, 'utf8');
  console.log(
    `Patched ${migration.name} with schema guards, enum deduping, and safe FOREIGN KEY guards.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
