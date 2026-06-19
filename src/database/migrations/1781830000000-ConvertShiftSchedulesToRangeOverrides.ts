import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class ConvertShiftSchedulesToRangeOverrides1781830000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('shift_schedules'))) {
      return;
    }

    await this.addColumnIfMissing(
      queryRunner,
      'shift_schedules',
      new TableColumn({
        name: 'effective_from',
        type: 'date',
        isNullable: true,
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'shift_schedules',
      new TableColumn({
        name: 'effective_to',
        type: 'date',
        isNullable: true,
      }),
    );

    await queryRunner.query(`
      UPDATE \`shift_schedules\`
      SET
        \`effective_from\` = COALESCE(\`effective_from\`, \`schedule_date\`),
        \`effective_to\` = COALESCE(\`effective_to\`, \`schedule_date\`)
      WHERE \`schedule_date\` IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`shift_schedules\`
      MODIFY \`effective_from\` date NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`shift_schedules\`
      MODIFY \`shift_id\` int NULL
    `);

    await this.dropIndexIfExists(
      queryRunner,
      'shift_schedules',
      'UQ_shift_schedules_company_employee_date',
    );

    await this.addIndexIfMissing(
      queryRunner,
      'shift_schedules',
      new TableIndex({
        name: 'IDX_shift_schedules_effective_from',
        columnNames: ['effective_from'],
      }),
    );
    await this.addIndexIfMissing(
      queryRunner,
      'shift_schedules',
      new TableIndex({
        name: 'IDX_shift_schedules_effective_to',
        columnNames: ['effective_to'],
      }),
    );
    await this.addIndexIfMissing(
      queryRunner,
      'shift_schedules',
      new TableIndex({
        name: 'IDX_shift_schedules_company_employee_from',
        columnNames: ['company_id', 'employee_id', 'effective_from'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('shift_schedules'))) {
      return;
    }

    await this.dropIndexIfExists(
      queryRunner,
      'shift_schedules',
      'IDX_shift_schedules_company_employee_from',
    );
    await this.dropIndexIfExists(
      queryRunner,
      'shift_schedules',
      'IDX_shift_schedules_effective_to',
    );
    await this.dropIndexIfExists(
      queryRunner,
      'shift_schedules',
      'IDX_shift_schedules_effective_from',
    );

    await this.addIndexIfMissing(
      queryRunner,
      'shift_schedules',
      new TableIndex({
        name: 'UQ_shift_schedules_company_employee_date',
        columnNames: ['company_id', 'employee_id', 'schedule_date'],
        isUnique: true,
      }),
    );

    await queryRunner.query(`
      UPDATE \`shift_schedules\`
      SET \`shift_id\` = \`override_shift_id\`
      WHERE \`shift_id\` IS NULL AND \`override_shift_id\` IS NOT NULL
    `);

    const [{ nullShiftCount }] = await queryRunner.query(`
      SELECT COUNT(*) AS nullShiftCount
      FROM \`shift_schedules\`
      WHERE \`shift_id\` IS NULL
    `);

    if (Number(nullShiftCount ?? 0) === 0) {
      await queryRunner.query(`
        ALTER TABLE \`shift_schedules\`
        MODIFY \`shift_id\` int NOT NULL
      `);
    }

    await this.dropColumnIfExists(
      queryRunner,
      'shift_schedules',
      'effective_to',
    );
    await this.dropColumnIfExists(
      queryRunner,
      'shift_schedules',
      'effective_from',
    );
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    column: TableColumn,
  ): Promise<void> {
    if (!(await queryRunner.hasColumn(tableName, column.name))) {
      await queryRunner.addColumn(tableName, column);
    }
  }

  private async dropColumnIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<void> {
    if (await queryRunner.hasColumn(tableName, columnName)) {
      await queryRunner.dropColumn(tableName, columnName);
    }
  }

  private async addIndexIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    index: TableIndex,
  ): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    const exists = table?.indices.some((item) => item.name === index.name);
    if (!exists) {
      await queryRunner.createIndex(tableName, index);
    }
  }

  private async dropIndexIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
  ): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    const exists = table?.indices.some((item) => item.name === indexName);
    if (exists) {
      await queryRunner.dropIndex(tableName, indexName);
    }
  }
}
