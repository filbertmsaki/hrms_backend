import { MigrationInterface, QueryRunner } from 'typeorm';

// Best-effort heuristic backfill: for each department, pick the active employee
// assigned to it whose primary position is flagged is_manager = true, preferring
// one whose own manager reports outside the department (or has no manager).
// Departments with zero qualifying candidates are left NULL and reported below.
export class BackfillDepartmentManagers1786104000000
  implements MigrationInterface
{
  name = 'BackfillDepartmentManagers1786104000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH candidate AS (
        SELECT
          e."id" AS employee_id,
          e."primary_department_id" AS department_id,
          e."reports_to",
          mgr."primary_department_id" AS manager_department_id,
          ROW_NUMBER() OVER (
            PARTITION BY e."primary_department_id"
            ORDER BY (mgr."primary_department_id" IS DISTINCT FROM e."primary_department_id") DESC, e."id" ASC
          ) AS rn
        FROM "employees" e
        INNER JOIN "positions" p ON p."id" = e."primary_position_id" AND p."is_manager" = true
        LEFT JOIN "employees" mgr ON mgr."id" = e."reports_to"
        WHERE e."employment_status" = 'active'
          AND e."primary_department_id" IS NOT NULL
      )
      UPDATE "departments" d
      SET "manager_employee_id" = c."employee_id"
      FROM candidate c
      WHERE c."department_id" = d."id" AND c."rn" = 1
    `);

    const unresolved: Array<{ id: number; name: string }> =
      await queryRunner.query(`
      SELECT "id", "name" FROM "departments" WHERE "manager_employee_id" IS NULL
    `);

    if (unresolved.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `[BackfillDepartmentManagers] ${unresolved.length} department(s) have no resolvable manager and require manual setup: ` +
          unresolved.map((d) => `${d.name} (id=${d.id})`).join(', '),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Best-effort backfill; reverting cannot distinguish rows this migration set
    // from manager assignments made afterward, so this is intentionally a no-op.
  }
}
