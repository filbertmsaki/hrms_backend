import { AppDataSource } from './data-source';

const oldTimestamp = 1792500000000;
const newTimestamp = 1792500000001;
const oldName = 'CreatePayrollAndPayslips1792500000000';
const newName = 'CreatePayrollAndPayslips1792500000001';

type MigrationMetadataRow = {
  id: number;
  timestamp: string | number;
  name: string;
};

async function queryMigrationRows(): Promise<MigrationMetadataRow[]> {
  return await AppDataSource.query(
    `
      SELECT id, timestamp, name
      FROM migrations
      WHERE name IN ($1, $2)
      ORDER BY id ASC
    `,
    [oldName, newName],
  );
}

async function normalize(): Promise<void> {
  await AppDataSource.initialize();

  try {
    const rows = await queryMigrationRows();

    const hasNew = rows.some((row) => row.name === newName);
    if (hasNew) {
      console.log(`Migration metadata already normalized to ${newName}.`);
      return;
    }

    const legacyRow = rows.find(
      (row) => row.name === oldName && Number(row.timestamp) === oldTimestamp,
    );

    if (!legacyRow) {
      console.log(
        `No legacy migration row found for ${oldName}. Nothing to normalize.`,
      );
      return;
    }

    await AppDataSource.query(
      `
        UPDATE migrations
        SET timestamp = $1,
            name = $2
        WHERE id = $3
      `,
      [newTimestamp, newName, legacyRow.id],
    );

    console.log(`Normalized migration metadata from ${oldName} to ${newName}.`);
  } finally {
    await AppDataSource.destroy();
  }
}

normalize().catch((error) => {
  console.error('Failed to normalize migration metadata.', error);
  process.exitCode = 1;
});
