import { EntityManager } from 'typeorm';

export function latestScheduleRevisions(
  manager: EntityManager,
  companyId: number,
  kind: 'week-plan' | 'template',
  id: number,
): Promise<
  Array<{
    revision: number;
    recorded_at: Date;
    configuration: Record<string, unknown>;
  }>
> {
  return manager.query(
    'SELECT revision, recorded_at, configuration FROM access_schedule_revisions WHERE company_id = $1 AND kind = $2 AND resource_id = $3 ORDER BY revision DESC LIMIT 20',
    [companyId, kind, id],
  );
}

/** Record affected group and directly assigned users before schedule mutation. */
export async function recordScheduleReconciliation(
  manager: EntityManager,
  companyId: number,
  source: 'template' | 'week_plan',
  id: number,
  actor: number | null,
): Promise<void> {
  const predicate = source === 'template' ? 't.id = $2' : 't.week_plan_id = $2';
  await manager.query(
    `WITH templates AS (
       SELECT t.id FROM access_schedule_templates t WHERE t.company_id = $1 AND ${predicate}
     ), targets AS (
       SELECT g.company_id, m.employee_id, CASE WHEN m.employee_id IS NULL THEN m.employee_no ELSE NULL END AS unresolved_employee_no, gd.device_id, g.id AS source_group_id
       FROM access_group_doors gd
       JOIN templates t ON t.id = gd.schedule_template_id
       JOIN access_groups g ON g.id = gd.access_group_id AND g.company_id = $1
       JOIN access_group_employees m ON m.access_group_id = g.id
       JOIN attendance_devices d ON d.id = gd.device_id AND d.company_id = g.company_id
       UNION
       SELECT a.company_id, a.employee_id, CASE WHEN a.employee_id IS NULL THEN a.employee_no ELSE NULL END, a.device_id, NULL::integer
       FROM employee_device_right_plans rp
       JOIN templates t ON t.id = rp.schedule_template_id
       JOIN employee_device_assignments a ON a.id = rp.employee_device_assignment_id AND a.company_id = $1
       JOIN attendance_devices d ON d.id = a.device_id AND d.company_id = a.company_id
       WHERE a.device_id IS NOT NULL
     )
     INSERT INTO access_reconciliation_operations
       (company_id, employee_id, unresolved_employee_no, device_id, source_group_id, requested_by_company_user_id, reason, status)
     SELECT company_id, employee_id, unresolved_employee_no, device_id, source_group_id, $3, 'SCHEDULE_CHANGED', 'PENDING_REVIEW' FROM targets`,
    [companyId, id, actor],
  );
}
