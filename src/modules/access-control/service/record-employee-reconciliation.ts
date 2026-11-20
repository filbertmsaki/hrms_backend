import { EntityManager } from 'typeorm';

/** Snapshot existing device targets before an employee's organization changes. */
export async function recordEmployeeReconciliation(
  manager: EntityManager,
  companyId: number,
  employeeId: number,
  actor: number | null,
  reason: 'EMPLOYEE_TRANSFER' | 'EMPLOYEE_STATUS' = 'EMPLOYEE_TRANSFER',
  effectiveDate: string | null = null,
): Promise<void> {
  await manager.query(
    `WITH group_devices AS (
       SELECT access_group_id, device_id FROM access_group_devices
       UNION
       SELECT access_group_id, device_id FROM access_group_doors WHERE device_id IS NOT NULL
     ), targets AS (
       SELECT g.company_id, m.employee_id, gd.device_id, g.id AS source_group_id
       FROM access_group_employees m
       JOIN access_groups g ON g.id = m.access_group_id AND g.company_id = $1
       JOIN group_devices gd ON gd.access_group_id = g.id
       JOIN attendance_devices d ON d.id = gd.device_id AND d.company_id = g.company_id
       WHERE m.employee_id = $2
       UNION
       SELECT a.company_id, a.employee_id, a.device_id, NULL::integer
       FROM employee_device_assignments a
       JOIN attendance_devices d ON d.id = a.device_id AND d.company_id = a.company_id
       WHERE a.company_id = $1 AND a.employee_id = $2 AND a.device_id IS NOT NULL
     )
     INSERT INTO access_reconciliation_operations
       (company_id, employee_id, device_id, source_group_id, requested_by_company_user_id, reason, effective_date, status)
     SELECT company_id, employee_id, device_id, source_group_id, $3, $4, $5::date, 'PENDING_REVIEW' FROM targets`,
    [companyId, employeeId, actor, reason, effectiveDate],
  );
}
