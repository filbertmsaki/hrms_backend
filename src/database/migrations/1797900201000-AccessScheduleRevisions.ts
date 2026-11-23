import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccessScheduleRevisions1797900201000 implements MigrationInterface {
  name = 'AccessScheduleRevisions1797900201000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`CREATE TABLE access_schedule_revisions (
      company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('week-plan','template')),
      resource_id integer NOT NULL,
      revision integer NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      configuration jsonb NOT NULL,
      PRIMARY KEY(company_id,kind,resource_id,revision)
    )`);
    // Query the final committed schedule, so replacing several segments records one revision.
    // Snapshot only functional fields. Device response metadata and secrets are excluded.
    await db.query(`CREATE FUNCTION hrms_record_schedule_revision(tenant integer, category text, resource integer)
      RETURNS void LANGUAGE plpgsql AS $$
      DECLARE config jsonb; previous access_schedule_revisions%ROWTYPE;
      BEGIN
        PERFORM pg_advisory_xact_lock(hashtextextended(tenant::text || ':' || category || ':' || resource::text,0));
        IF category='week-plan' THEN
          SELECT jsonb_build_object('device_id',p.device_id,'number',p.hikvision_plan_no,'name',p.name,'enabled',p.enable,
            'segments',COALESCE((SELECT jsonb_agg(jsonb_build_array(s.week_day,s.segment_no,s.enable,s.begin_time,s.end_time) ORDER BY s.week_day,s.segment_no)
            FROM access_week_plan_segments s WHERE s.week_plan_id=p.id),'[]'::jsonb))
          INTO config FROM access_week_plans p WHERE p.company_id=tenant AND p.id=resource;
        ELSE
          SELECT jsonb_build_object('device_id',t.device_id,'number',t.hikvision_template_no,'name',t.template_name,
            'week_plan_id',t.week_plan_id,'week_plan_number',t.hikvision_week_plan_no,'holiday_group',t.holiday_group_no,
            'enabled',t.enable,'type',t.schedule_type,'status',t.status)
          INTO config FROM access_schedule_templates t WHERE t.company_id=tenant AND t.id=resource;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM companies WHERE id=tenant) THEN RETURN; END IF;
        SELECT * INTO previous FROM access_schedule_revisions WHERE company_id=tenant AND kind=category AND resource_id=resource ORDER BY revision DESC LIMIT 1;
        config := COALESCE(config,'{"deleted":true}'::jsonb);
        IF previous.configuration IS DISTINCT FROM config THEN
          INSERT INTO access_schedule_revisions(company_id,kind,resource_id,revision,configuration)
          VALUES(tenant,category,resource,COALESCE(previous.revision,0)+1,config);
        END IF;
      END $$`);
    await db.query(`CREATE FUNCTION hrms_capture_schedule_revision() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE tenant integer; resource integer;
      BEGIN
        IF TG_TABLE_NAME='access_week_plan_segments' THEN
          IF TG_OP <> 'INSERT' THEN
            SELECT company_id INTO tenant FROM access_week_plans WHERE id=OLD.week_plan_id;
            IF tenant IS NOT NULL THEN PERFORM hrms_record_schedule_revision(tenant,'week-plan',OLD.week_plan_id); END IF;
          END IF;
          IF TG_OP <> 'DELETE' THEN
            SELECT company_id INTO tenant FROM access_week_plans WHERE id=NEW.week_plan_id;
            IF tenant IS NOT NULL THEN PERFORM hrms_record_schedule_revision(tenant,'week-plan',NEW.week_plan_id); END IF;
          END IF;
        ELSE
          IF TG_OP='DELETE' THEN tenant:=OLD.company_id; resource:=OLD.id;
          ELSE tenant:=NEW.company_id; resource:=NEW.id; END IF;
          PERFORM hrms_record_schedule_revision(tenant, TG_ARGV[0], resource);
        END IF;
        RETURN NULL;
      END $$`);
    for (const [table, kind] of [
      ['access_week_plans', 'week-plan'],
      ['access_week_plan_segments', 'week-plan'],
      ['access_schedule_templates', 'template'],
    ]) {
      await db.query(`CREATE CONSTRAINT TRIGGER capture_schedule_revision AFTER INSERT OR UPDATE OR DELETE ON ${table}
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hrms_capture_schedule_revision('${kind}')`);
    }
    await db.query(
      "SELECT hrms_record_schedule_revision(company_id,'week-plan',id) FROM access_week_plans ORDER BY company_id,id",
    );
    await db.query(
      "SELECT hrms_record_schedule_revision(company_id,'template',id) FROM access_schedule_templates ORDER BY company_id,id",
    );
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Restore the pre-release snapshot to recover the original schema and preserve schedule history.',
      ),
    );
  }
}
