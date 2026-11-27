import { EntityManager } from 'typeorm';

/** Display names of company users (first + last name of the linked user). */
export async function companyUserNames(
  manager: EntityManager,
  ids: Array<number | null | undefined>,
): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((id): id is number => !!id))];
  const result = new Map<number, string>();
  if (!unique.length) return result;
  const rows = await manager.query<Array<{ id: number; name: string }>>(
    `SELECT cu.id, TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS name
       FROM company_users cu JOIN users u ON u.id = cu.user_id
      WHERE cu.id = ANY($1::int[])`,
    [unique],
  );
  for (const row of rows) result.set(Number(row.id), row.name);
  return result;
}
