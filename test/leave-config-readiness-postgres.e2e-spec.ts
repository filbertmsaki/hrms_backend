/**
 * FRS-11 Phase 4 — configuration readiness report against real Postgres.
 *
 *   DB_NAME=hrms_frs11_e2e npm run test:e2e -- leave-config-readiness-postgres
 */
import './setup-e2e';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../src/database/data-source';
import { LeaveConfigReadinessService } from '../src/modules/hr/leave/services/leave-config-readiness.service';

describe('Leave configuration readiness (real Postgres)', () => {
  let ds: DataSource;
  let companyId: number;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const id = async (sql: string, p: unknown[]) =>
    (await ds.query(sql, p))[0].id;

  beforeAll(async () => {
    if (!/_e2e$/.test(process.env.DB_NAME ?? ''))
      throw new Error('Restricted to *_e2e databases.');
    ds = AppDataSource.isInitialized
      ? AppDataSource
      : await AppDataSource.initialize();
    companyId = await id(
      `INSERT INTO companies (name, slug) VALUES ($1,$2) RETURNING id`,
      [`Ready ${suffix}`, `ready-${suffix}`],
    );
    await ds.query(
      `INSERT INTO leave_statutory_company_settings (company_id, default_jurisdiction_code) VALUES ($1,'TZ-MAINLAND')`,
      [companyId],
    );
    const sick = await id(
      `INSERT INTO leave_types (company_id, name, code) VALUES ($1,'Sick','SL') RETURNING id`,
      [companyId],
    );
    await ds.query(
      `INSERT INTO leave_types (company_id, name, code, comp_off_enabled, is_carry_forward_allowed, max_days_per_year)
       VALUES ($1,'Comp off','CO',true,false,0), ($1,'Annual','AL',false,true,21), ($1,'Unpaid','LWP',false,false,0)`,
      [companyId],
    );
    await ds.query(
      `UPDATE leave_types SET is_paid=false WHERE company_id=$1 AND code='LWP'`,
      [companyId],
    );
    const set = await id(
      `INSERT INTO leave_statutory_rule_sets (company_id, jurisdiction_code, name, status, verification_status, effective_from)
       VALUES ($1,'TZ-MAINLAND','Mainland template','active','unverified','2020-01-01') RETURNING id`,
      [companyId],
    );
    await ds.query(
      `INSERT INTO leave_statutory_rules (rule_set_id, rule_type, leave_type_id, settings)
       VALUES ($1,'sick_leave',$2,$3), ($1,'maternity_leave',NULL,'{}')`,
      [
        set,
        sick,
        JSON.stringify({
          reference_period_months: 36,
          stages: [
            { days: 63, pay_percent: 100 },
            { days: 63, pay_percent: 150 },
          ],
        }),
      ],
    );
    await ds.query(
      `INSERT INTO leave_statutory_rule_sets (company_id, jurisdiction_code, name, status, verification_status)
       VALUES ($1,'TZ-ZANZIBAR','Zanzibar template','draft','unverified')`,
      [companyId],
    );
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
      await ds.destroy();
    }
  });

  it('reports unapproved statutory, invalid bands, comp-off, carry and finance gaps without changing anything', async () => {
    const before = await ds.query(
      `SELECT status, verification_status FROM leave_statutory_rule_sets WHERE company_id=$1 ORDER BY id`,
      [companyId],
    );
    const report = await new LeaveConfigReadinessService(
      ds,
      undefined,
      false,
    ).report(companyId, '2026-11-17');
    const codes = (sev: string) =>
      report.findings
        .filter((f) => f.severity === sev)
        .map((f) => `${f.code}:${f.subject ?? ''}`);
    expect(codes('blocker')).toEqual(
      expect.arrayContaining([
        'unverified_active_rule_set:TZ-MAINLAND / Mainland template',
        'invalid_sick_bands:TZ-MAINLAND',
        'rule_not_linked_to_leave_type:TZ-MAINLAND / maternity_leave',
        'comp_off_enabled_without_policy:CO (Comp off)',
        'payroll_component_missing:LEAVE_ENCASHMENT',
        'payroll_component_missing:PUBLIC_HOLIDAY_WORK',
      ]),
    );
    // Zanzibar is required but not in use by this company: a warning, naming the draft.
    const zanzibar = report.findings.find((f) => f.subject === 'TZ-ZANZIBAR')!;
    expect(zanzibar).toMatchObject({
      severity: 'warning',
      code: 'no_active_rule_set',
    });
    expect(zanzibar.message).toMatch(/Zanzibar template/);
    expect(codes('warning')).toEqual(
      expect.arrayContaining([
        'unlimited_carry_forward:AL (Annual)',
        'sick_bands_increase:TZ-MAINLAND',
        'no_payroll_leave_rule:SL (Sick)',
        'missing_rule_type:TZ-MAINLAND / annual_leave',
      ]),
    );
    expect(codes('ok')).toContain('unpaid_type_default:LWP (Unpaid)');
    expect(report.blocked_features).toEqual(
      expect.arrayContaining([
        'Compensatory-off earning',
        'Statutory rules for TZ-MAINLAND',
        'Payroll handoff (LEAVE_ENCASHMENT)',
      ]),
    );
    expect(LeaveConfigReadinessService.toMarkdown(report)).toMatch(
      /\| blocker \| statutory \|/,
    );
    const after = await ds.query(
      `SELECT status, verification_status FROM leave_statutory_rule_sets WHERE company_id=$1 ORDER BY id`,
      [companyId],
    );
    expect(after).toEqual(before); // read-only
  });

  it('marks a Zanzibar branch as a blocker when the jurisdiction is in use without an active set', async () => {
    await ds.query(
      `INSERT INTO branches (company_id, name, statutory_jurisdiction_code) VALUES ($1,'Stone Town','TZ-ZANZIBAR')`,
      [companyId],
    );
    const report = await new LeaveConfigReadinessService(
      ds,
      undefined,
      false,
    ).report(companyId, '2026-11-17');
    const z = report.findings.find((f) => f.subject === 'TZ-ZANZIBAR')!;
    expect(z.severity).toBe('blocker');
    expect(report.blocked_features).toContain(
      'Statutory rules for TZ-ZANZIBAR',
    );
  });
});
