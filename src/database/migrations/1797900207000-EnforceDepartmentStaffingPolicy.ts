import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceDepartmentStaffingPolicy1797900207000 implements MigrationInterface {
  async up(db: QueryRunner): Promise<void> {
    await db.query(`CREATE FUNCTION hrms_check_staffing_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE seats integer; occupied integer; reserved integer; employee_exclusion integer; invitation_exclusion integer;
      BEGIN
        IF NEW.primary_position_id IS NULL THEN RETURN NEW; END IF;
        IF TG_TABLE_NAME = 'employees' THEN
          IF NEW.employment_status NOT IN ('onboarding','active','suspended') THEN RETURN NEW; END IF;
          IF TG_OP = 'UPDATE' AND OLD.company_id = NEW.company_id AND OLD.primary_position_id = NEW.primary_position_id
            AND OLD.primary_department_id IS NOT DISTINCT FROM NEW.primary_department_id
            AND OLD.employment_status IN ('onboarding','active','suspended') THEN RETURN NEW; END IF;
          employee_exclusion := NEW.id;
        ELSE
          IF NEW.status <> 'pending' OR NEW.expires_at <= now() THEN RETURN NEW; END IF;
          IF TG_OP = 'UPDATE' AND OLD.company_id = NEW.company_id AND OLD.primary_position_id = NEW.primary_position_id
            AND OLD.primary_department_id IS NOT DISTINCT FROM NEW.primary_department_id
            AND OLD.status = 'pending' AND OLD.expires_at > now() THEN RETURN NEW; END IF;
          invitation_exclusion := NEW.id;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = NEW.company_id AND c.metadata->>'enforce_staffing_limit' = 'true') THEN RETURN NEW; END IF;
        -- Serialize hires, invitation reservations and transfers for the same position.
        SELECT p.headcount INTO seats FROM positions p WHERE p.id = NEW.primary_position_id AND p.company_id = NEW.company_id FOR UPDATE;
        IF NOT FOUND THEN RETURN NEW; END IF;
        SELECT COALESCE((SELECT d.headcount FROM department_positions d WHERE d.company_id = NEW.company_id
          AND d.department_id = NEW.primary_department_id AND d.position_id = NEW.primary_position_id), seats) INTO seats;
        SELECT count(*) INTO occupied FROM employees e WHERE e.company_id = NEW.company_id
          AND e.primary_position_id = NEW.primary_position_id AND e.primary_department_id IS NOT DISTINCT FROM NEW.primary_department_id
          AND e.employment_status IN ('onboarding','active','suspended') AND e.id IS DISTINCT FROM employee_exclusion;
        SELECT count(*) INTO reserved FROM employee_invitations i WHERE i.company_id = NEW.company_id
          AND i.primary_position_id = NEW.primary_position_id AND i.primary_department_id IS NOT DISTINCT FROM NEW.primary_department_id
          AND i.status = 'pending' AND i.expires_at > now() AND i.id IS DISTINCT FROM invitation_exclusion;
        IF occupied + reserved >= seats THEN
          RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_department_staffing_limit', MESSAGE = 'The position is full in this department.';
        END IF;
        RETURN NEW;
      END $$`);
    await db.query(`CREATE TRIGGER employee_staffing_capacity BEFORE INSERT OR UPDATE OF company_id,primary_department_id,primary_position_id,employment_status
      ON employees FOR EACH ROW EXECUTE FUNCTION hrms_check_staffing_capacity()`);
    await db.query(`CREATE TRIGGER invitation_staffing_capacity BEFORE INSERT OR UPDATE OF company_id,primary_department_id,primary_position_id,status,expires_at
      ON employee_invitations FOR EACH ROW EXECUTE FUNCTION hrms_check_staffing_capacity()`);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(
      'DROP TRIGGER invitation_staffing_capacity ON employee_invitations',
    );
    await db.query('DROP TRIGGER employee_staffing_capacity ON employees');
    await db.query('DROP FUNCTION hrms_check_staffing_capacity()');
  }
}
