import { EntityManager } from 'typeorm';

export async function recordImportedGroupChange(
  manager: EntityManager,
  companyId: number,
  groupId: number,
  deviceId: number,
): Promise<void> {
  await manager.query(
    `INSERT INTO access_reconciliation_operations
       (company_id, employee_id, unresolved_employee_no, device_id, source_group_id, reason, status)
     SELECT DISTINCT g.company_id, m.employee_id, CASE WHEN m.employee_id IS NULL THEN m.employee_no ELSE NULL END, d.id, g.id, 'IMPORTED_GROUP', 'PENDING_REVIEW'
     FROM access_groups g
     JOIN access_group_employees m ON m.access_group_id = g.id
     JOIN attendance_devices d ON d.id = $3 AND d.company_id = g.company_id
     WHERE g.company_id = $1 AND g.id = $2`,
    [companyId, groupId, deviceId],
  );
}
