import { MigrationInterface, QueryRunner } from 'typeorm';

export class CaptureDirectAccessChanges1797900091000 implements MigrationInterface {
  name = 'CaptureDirectAccessChanges1797900091000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION capture_direct_assignment_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'UPDATE' AND
          ROW(OLD.company_id, OLD.employee_id, OLD.device_id, OLD.employee_no, OLD.organization_id, OLD.hikvision_user_type, OLD.user_verify_mode, OLD.valid_begin_time, OLD.valid_end_time, OLD.valid_enabled, OLD.door_right, OLD.local_ui_right, OLD.close_delay_enabled, OLD.max_open_door_time, OLD.open_door_time, OLD.sync_status, OLD.deleted_at)
          IS NOT DISTINCT FROM
          ROW(NEW.company_id, NEW.employee_id, NEW.device_id, NEW.employee_no, NEW.organization_id, NEW.hikvision_user_type, NEW.user_verify_mode, NEW.valid_begin_time, NEW.valid_end_time, NEW.valid_enabled, NEW.door_right, NEW.local_ui_right, NEW.close_delay_enabled, NEW.max_open_door_time, NEW.open_door_time, NEW.sync_status, NEW.deleted_at)
        THEN RETURN NEW; END IF;
        IF TG_OP <> 'INSERT' AND OLD.device_id IS NOT NULL
          AND (TG_OP = 'DELETE' OR ROW(OLD.company_id, OLD.employee_id, OLD.device_id) IS DISTINCT FROM ROW(NEW.company_id, NEW.employee_id, NEW.device_id) OR (OLD.employee_id IS NULL AND OLD.employee_no IS DISTINCT FROM NEW.employee_no)) THEN
          INSERT INTO access_reconciliation_operations(company_id, employee_id, unresolved_employee_no, device_id, source_group_id, reason, status)
          VALUES (OLD.company_id, OLD.employee_id, CASE WHEN OLD.employee_id IS NULL THEN OLD.employee_no ELSE NULL END, OLD.device_id, NULL, 'DIRECT_REMOVED', 'PENDING_REVIEW');
        END IF;
        IF TG_OP <> 'DELETE' AND NEW.device_id IS NOT NULL THEN
          INSERT INTO access_reconciliation_operations(company_id, employee_id, unresolved_employee_no, device_id, source_group_id, reason, status)
          VALUES (NEW.company_id, NEW.employee_id, CASE WHEN NEW.employee_id IS NULL THEN NEW.employee_no ELSE NULL END, NEW.device_id, NULL, 'DIRECT_CHANGED', 'PENDING_REVIEW');
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$
    `);
    await queryRunner.query(
      'CREATE TRIGGER trg_capture_direct_assignment AFTER INSERT OR UPDATE OR DELETE ON employee_device_assignments FOR EACH ROW EXECUTE FUNCTION capture_direct_assignment_change()',
    );
    await queryRunner.query(`
      CREATE FUNCTION capture_direct_right_change() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE old_assignment integer; new_assignment integer;
      BEGIN
        IF TG_OP = 'UPDATE' AND
          ROW(OLD.employee_device_assignment_id, OLD.device_id, OLD.door_id, OLD.door_no, OLD.schedule_template_id, OLD.hikvision_template_no, OLD.is_active)
          IS NOT DISTINCT FROM
          ROW(NEW.employee_device_assignment_id, NEW.device_id, NEW.door_id, NEW.door_no, NEW.schedule_template_id, NEW.hikvision_template_no, NEW.is_active)
        THEN RETURN NEW; END IF;
        IF TG_OP <> 'INSERT' THEN old_assignment := OLD.employee_device_assignment_id; END IF;
        IF TG_OP <> 'DELETE' THEN new_assignment := NEW.employee_device_assignment_id; END IF;
        INSERT INTO access_reconciliation_operations(company_id, employee_id, unresolved_employee_no, device_id, source_group_id, reason, status)
        SELECT DISTINCT a.company_id, a.employee_id, CASE WHEN a.employee_id IS NULL THEN a.employee_no ELSE NULL END, a.device_id, NULL::integer, 'DIRECT_RIGHTS', 'PENDING_REVIEW'
        FROM employee_device_assignments a
        WHERE a.id IN (old_assignment, new_assignment) AND a.device_id IS NOT NULL;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$
    `);
    await queryRunner.query(
      'CREATE TRIGGER trg_capture_direct_right AFTER INSERT OR UPDATE OR DELETE ON employee_device_right_plans FOR EACH ROW EXECUTE FUNCTION capture_direct_right_change()',
    );
    await queryRunner.query(`
      CREATE FUNCTION capture_imported_group_member() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'INSERT' AND NEW.source <> 'DEVICE_SYNC' THEN RETURN NEW; END IF;
        IF TG_OP = 'UPDATE' AND ROW(OLD.employee_id, OLD.access_group_id, OLD.organization_id, OLD.employee_no)
          IS NOT DISTINCT FROM ROW(NEW.employee_id, NEW.access_group_id, NEW.organization_id, NEW.employee_no)
        THEN RETURN NEW; END IF;
        IF TG_OP = 'UPDATE' AND
          ROW(OLD.employee_id, OLD.access_group_id, OLD.employee_no) IS DISTINCT FROM ROW(NEW.employee_id, NEW.access_group_id, NEW.employee_no) THEN
          INSERT INTO access_reconciliation_operations(company_id, employee_id, unresolved_employee_no, device_id, source_group_id, reason, status)
          SELECT DISTINCT g.company_id, OLD.employee_id, CASE WHEN OLD.employee_id IS NULL THEN OLD.employee_no ELSE NULL END, targets.device_id, g.id, 'MEMBERSHIP_CHANGED', 'PENDING_REVIEW'
          FROM access_groups g JOIN (SELECT access_group_id, device_id FROM access_group_devices UNION SELECT access_group_id, device_id FROM access_group_doors WHERE device_id IS NOT NULL) targets ON targets.access_group_id = g.id
          JOIN attendance_devices d ON d.id = targets.device_id AND d.company_id = g.company_id
          WHERE g.id = OLD.access_group_id;
        END IF;
        INSERT INTO access_reconciliation_operations(company_id, employee_id, unresolved_employee_no, device_id, source_group_id, reason, status)
        SELECT DISTINCT g.company_id, NEW.employee_id, CASE WHEN NEW.employee_id IS NULL THEN NEW.employee_no ELSE NULL END, targets.device_id, g.id, 'MEMBERSHIP_CHANGED', 'PENDING_REVIEW'
        FROM access_groups g JOIN (SELECT access_group_id, device_id FROM access_group_devices UNION SELECT access_group_id, device_id FROM access_group_doors WHERE device_id IS NOT NULL) targets ON targets.access_group_id = g.id
        JOIN attendance_devices d ON d.id = targets.device_id AND d.company_id = g.company_id
        WHERE g.id = NEW.access_group_id;
        RETURN NEW;
      END $$
    `);
    await queryRunner.query(
      'CREATE TRIGGER trg_capture_imported_group_member AFTER INSERT OR UPDATE ON access_group_employees FOR EACH ROW EXECUTE FUNCTION capture_imported_group_member()',
    );
    await queryRunner.query(`
      CREATE FUNCTION record_credential_targets(p_company integer, p_employee integer, p_employee_no varchar, p_device integer)
      RETURNS void LANGUAGE plpgsql AS $$
      DECLARE company integer;
      BEGIN
        SELECT COALESCE(p_company,
          (SELECT company_id FROM attendance_devices WHERE id = p_device),
          (SELECT company_id FROM employees WHERE id = p_employee)) INTO company;
        IF company IS NULL THEN RETURN; END IF;
        IF p_employee IS NOT NULL AND EXISTS (SELECT 1 FROM employees e WHERE e.id = p_employee AND e.company_id <> company) THEN
          RAISE EXCEPTION 'Credential employee belongs to a different company';
        END IF;
        IF p_device IS NOT NULL THEN
          IF EXISTS (SELECT 1 FROM attendance_devices d WHERE d.id = p_device AND d.company_id <> company) THEN
            RAISE EXCEPTION 'Credential device belongs to a different company';
          END IF;
          INSERT INTO access_reconciliation_operations(company_id, employee_id, unresolved_employee_no, device_id, source_group_id, reason, status)
          VALUES (company, p_employee, CASE WHEN p_employee IS NULL THEN p_employee_no ELSE NULL END, p_device, NULL, 'CREDENTIAL_CHANGED', 'PENDING_REVIEW');
        ELSIF p_employee IS NOT NULL THEN
          INSERT INTO access_reconciliation_operations(company_id, employee_id, device_id, source_group_id, reason, status)
          SELECT DISTINCT a.company_id, a.employee_id, a.device_id, NULL::integer, 'CREDENTIAL_CHANGED', 'PENDING_REVIEW'
          FROM employee_device_assignments a
          WHERE a.company_id = company AND a.employee_id = p_employee AND a.device_id IS NOT NULL
          UNION
          SELECT DISTINCT g.company_id, p_employee, devices.device_id, g.id, 'CREDENTIAL_CHANGED', 'PENDING_REVIEW'
          FROM access_groups g JOIN access_group_employees m ON m.access_group_id = g.id
          JOIN (SELECT access_group_id, device_id FROM access_group_devices UNION SELECT access_group_id, device_id FROM access_group_doors WHERE device_id IS NOT NULL) devices ON devices.access_group_id = g.id
          JOIN attendance_devices d ON d.id = devices.device_id AND d.company_id = g.company_id
          WHERE g.company_id = company AND m.employee_id = p_employee;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE FUNCTION capture_credential_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'UPDATE' AND
          ROW(OLD.company_id, OLD.employee_id, OLD.employee_no, OLD.device_id, OLD.credential_type, OLD.credential_no, OLD.pin_password, OLD.card_no, OLD.fingerprint_id, OLD.card_reader_no, OLD.face_id, OLD.fingerprint_count, OLD.face_count, OLD.has_fingerprint, OLD.has_face, OLD.password_set, OLD.credential_status, OLD.issue_date, OLD.expiry_date, OLD.is_primary, OLD.deleted_at)
          IS NOT DISTINCT FROM
          ROW(NEW.company_id, NEW.employee_id, NEW.employee_no, NEW.device_id, NEW.credential_type, NEW.credential_no, NEW.pin_password, NEW.card_no, NEW.fingerprint_id, NEW.card_reader_no, NEW.face_id, NEW.fingerprint_count, NEW.face_count, NEW.has_fingerprint, NEW.has_face, NEW.password_set, NEW.credential_status, NEW.issue_date, NEW.expiry_date, NEW.is_primary, NEW.deleted_at)
        THEN RETURN NEW; END IF;
        IF TG_OP <> 'INSERT' AND (TG_OP = 'DELETE' OR ROW(OLD.company_id, OLD.employee_id, OLD.employee_no, OLD.device_id) IS DISTINCT FROM ROW(NEW.company_id, NEW.employee_id, NEW.employee_no, NEW.device_id)) THEN
          PERFORM record_credential_targets(OLD.company_id, OLD.employee_id, OLD.employee_no, OLD.device_id);
        END IF;
        IF TG_OP <> 'DELETE' THEN
          PERFORM record_credential_targets(NEW.company_id, NEW.employee_id, NEW.employee_no, NEW.device_id);
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$
    `);
    await queryRunner.query(
      'CREATE TRIGGER trg_capture_credential AFTER INSERT OR UPDATE OR DELETE ON employee_access_credentials FOR EACH ROW EXECUTE FUNCTION capture_credential_change()',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_capture_credential ON employee_access_credentials',
    );
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS capture_credential_change()',
    );
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS record_credential_targets(integer, integer, varchar, integer)',
    );
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_capture_imported_group_member ON access_group_employees',
    );
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS capture_imported_group_member()',
    );
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_capture_direct_right ON employee_device_right_plans',
    );
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS capture_direct_right_change()',
    );
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_capture_direct_assignment ON employee_device_assignments',
    );
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS capture_direct_assignment_change()',
    );
  }
}
