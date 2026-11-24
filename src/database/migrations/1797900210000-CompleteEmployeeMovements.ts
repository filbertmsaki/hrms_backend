import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteEmployeeMovements1797900210000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE employee_movement_policies (
      company_id integer PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      require_management_approval boolean NOT NULL,
      allow_backdating boolean NOT NULL,
      max_backdate_days integer NOT NULL CHECK (max_backdate_days >= 0)
    )`);
    await runner.query(`INSERT INTO permissions (name, display_name, description, scope, is_system_generated)
      VALUES ('employee_movements:manage-settings', 'Manage movement settings',
      'Configure movement approval and backdating rules for the active company', 'company', true)
      ON CONFLICT (name) DO NOTHING`);
    await runner.query(`INSERT INTO permission_role ("rolesId", "permissionsId")
      SELECT r.id, p.id FROM roles r JOIN permissions p ON p.name = 'employee_movements:manage-settings'
      WHERE r.company_id IS NOT NULL AND r.name = 'COMPANY_ADMIN' AND r.is_system_generated
      ON CONFLICT DO NOTHING`);
    await runner.query(`UPDATE employee_compensation_versions v SET payroll_sync_status = 'READY'
      FROM employee_movements m WHERE m.id = v.movement_id AND m.company_id = v.company_id
      AND m.employee_id = v.employee_id AND m.status = 'APPLIED' AND v.status IN ('ACTIVE','SUPERSEDED')
      AND v.payroll_sync_status = 'PENDING_PAYROLL_INTEGRATION'`);
    await runner.query(`INSERT INTO employee_employment_events
      (company_id, employee_id, event_type, effective_date, title, description, source_module,
       source_entity_type, source_entity_id, dedupe_key, created_at)
      SELECT m.company_id, m.employee_id, 'MOVEMENT_APPLIED', m.effective_date, 'Movement applied',
        initcap(replace(m.movement_type, '_', ' ')) || ' (' || m.movement_no || ')',
        'employee_movements', 'employee_movement', m.id, 'movement:applied:' || m.id,
        COALESCE(m.applied_at, m.updated_at)
      FROM employee_movements m WHERE m.status = 'APPLIED'
      AND NOT EXISTS (SELECT 1 FROM employee_employment_events e WHERE e.company_id = m.company_id
        AND e.employee_id = m.employee_id AND e.event_type = 'MOVEMENT_APPLIED'
        AND e.source_entity_id = m.id AND e.source_module = 'employee_movements')
      ON CONFLICT DO NOTHING`);
  }

  async down(runner: QueryRunner): Promise<void> {
    // Applied movement history and the readiness of approved pay remain true after rollback.
    const permission =
      "SELECT id FROM permissions WHERE name = 'employee_movements:manage-settings'";
    await runner.query(
      `DELETE FROM permission_role WHERE "permissionsId" IN (${permission})`,
    );
    await runner.query(
      `DELETE FROM permission_user WHERE "permissionsId" IN (${permission})`,
    );
    await runner.query(
      `DELETE FROM company_user_permissions WHERE permission_id IN (${permission})`,
    );
    await runner.query(
      `DELETE FROM permissions WHERE name = 'employee_movements:manage-settings'`,
    );
    await runner.query('DROP TABLE employee_movement_policies');
  }
}
