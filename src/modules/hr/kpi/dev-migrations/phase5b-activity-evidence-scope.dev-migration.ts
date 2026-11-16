import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase5bActivityEvidenceScopeDevelopmentOnly1798000001000 implements MigrationInterface {
  name = 'Phase5bActivityEvidenceScopeDevelopmentOnly1798000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION phase3_validate_kpi_activity_evidence_scope() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM phase3_kpi_achievement_activities activity
          WHERE activity.id = NEW.activity_id
            AND activity.company_id = NEW.company_id
        ) THEN
          RAISE EXCEPTION 'KPI activity evidence company does not match its activity';
        END IF;
        RETURN NEW;
      END $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER phase3_kpi_activity_evidence_scope
      BEFORE INSERT OR UPDATE ON phase3_kpi_achievement_activity_evidence
      FOR EACH ROW EXECUTE FUNCTION phase3_validate_kpi_activity_evidence_scope()
    `);
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Development-only KPI activity scope migration is forward-only',
      ),
    );
  }
}
