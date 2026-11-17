import { DataSource } from 'typeorm';

/**
 * FRS-11 configuration readiness (read-only). Lists what is valid, missing,
 * conflicting or unapproved for one company, and which features must stay
 * off until a business owner approves them. It never changes configuration.
 */
export type ReadinessSeverity = 'ok' | 'warning' | 'blocker';
export interface ReadinessFinding {
  area:
    | 'statutory'
    | 'sick_pay_bands'
    | 'leave_types'
    | 'policies'
    | 'carry_forward'
    | 'comp_off'
    | 'payroll_mapping'
    | 'finance';
  severity: ReadinessSeverity;
  code: string;
  message: string;
  owner: 'HR' | 'Legal' | 'Finance' | 'IT';
  subject?: string;
}
export interface ReadinessReport {
  company_id: number;
  generated_at: string;
  findings: ReadinessFinding[];
  blocked_features: string[];
  summary: Record<ReadinessSeverity, number>;
}

/** Jurisdictions this deployment must support (Tanzania Mainland, Zanzibar). */
export const REQUIRED_JURISDICTIONS = ['TZ-MAINLAND', 'TZ-ZANZIBAR'] as const;
const CORE_RULE_TYPES = [
  'annual_leave',
  'sick_leave',
  'maternity_leave',
  'paternity_leave',
] as const;

export interface PolicyConflictChecker {
  /** Returns a message per employee/leave type whose policy cannot be resolved. */
  conflicts(companyId: number, asOf: string): Promise<string[]>;
}

export class LeaveConfigReadinessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly policyConflicts?: PolicyConflictChecker,
    private readonly isProduction = process.env.NODE_ENV === 'production',
  ) {}

  async report(
    companyId: number,
    asOf = new Date().toISOString().slice(0, 10),
  ): Promise<ReadinessReport> {
    const f: ReadinessFinding[] = [];
    const q = <T>(sql: string, p: unknown[] = [companyId]) =>
      this.dataSource.query<T[]>(sql, p);

    // ---------------------------------------------------------- statutory
    const [settings] = await q<{ default_jurisdiction_code: string | null }>(
      `SELECT default_jurisdiction_code FROM leave_statutory_company_settings WHERE company_id=$1`,
    );
    const branchJurisdictions = await q<{ code: string; n: number }>(
      `SELECT statutory_jurisdiction_code code, count(*)::int n FROM branches
        WHERE company_id=$1 AND statutory_jurisdiction_code IS NOT NULL GROUP BY 1`,
    );
    const inUse = new Set<string>([
      ...(settings?.default_jurisdiction_code
        ? [settings.default_jurisdiction_code]
        : []),
      ...branchJurisdictions.map((b) => b.code),
    ]);
    if (!settings?.default_jurisdiction_code) {
      f.push({
        area: 'statutory',
        severity: 'warning',
        code: 'no_default_jurisdiction',
        owner: 'HR',
        message:
          'No company default jurisdiction: statutory rules apply only to branches that name one.',
      });
    }
    const sets = await q<{
      id: number;
      jurisdiction_code: string;
      name: string;
      status: string;
      verification_status: string;
      is_test_configuration: boolean;
      effective_from: string | null;
      effective_to: string | null;
    }>(
      `SELECT id, jurisdiction_code, name, status, verification_status, is_test_configuration,
              effective_from::text, effective_to::text
         FROM leave_statutory_rule_sets WHERE company_id=$1 ORDER BY jurisdiction_code, version_no`,
    );
    for (const code of new Set<string>([...REQUIRED_JURISDICTIONS, ...inUse])) {
      const active = sets.filter(
        (s) =>
          s.jurisdiction_code === code &&
          s.status === 'active' &&
          (!s.effective_from || s.effective_from <= asOf) &&
          (!s.effective_to || s.effective_to >= asOf),
      );
      const drafts = sets.filter(
        (s) =>
          s.jurisdiction_code === code &&
          ['draft', 'pending_approval'].includes(s.status),
      );
      if (!active.length) {
        f.push({
          area: 'statutory',
          severity: inUse.has(code) ? 'blocker' : 'warning',
          code: 'no_active_rule_set',
          owner: 'Legal',
          subject: code,
          message: `${code}: no active statutory rule set${drafts.length ? ` (${drafts.length} draft/pending: ${drafts.map((d) => d.name).join(', ')})` : ''}. Statutory floors, sick-pay bands and family-leave limits do not apply here.`,
        });
        continue;
      }
      if (active.length > 1) {
        f.push({
          area: 'statutory',
          severity: 'blocker',
          code: 'multiple_active_rule_sets',
          owner: 'Legal',
          subject: code,
          message: `${code}: ${active.length} rule sets active on ${asOf}; exactly one must apply.`,
        });
      }
      for (const set of active) {
        if (set.verification_status !== 'verified') {
          f.push({
            area: 'statutory',
            severity: 'blocker',
            code: 'unverified_active_rule_set',
            owner: 'Legal',
            subject: `${code} / ${set.name}`,
            message: `${set.name} is active but its legal verification is "${set.verification_status}".`,
          });
        }
        if (set.is_test_configuration) {
          f.push({
            area: 'statutory',
            severity: this.isProduction ? 'blocker' : 'warning',
            code: 'test_configuration_active',
            owner: 'Legal',
            subject: `${code} / ${set.name}`,
            message: `${set.name} is a test configuration and must not be used for real employees.`,
          });
        }
        const rules = await q<{
          rule_type: string;
          leave_type_id: number | null;
          settings: Record<string, unknown>;
        }>(
          `SELECT rule_type, leave_type_id, settings FROM leave_statutory_rules WHERE rule_set_id=$1`,
          [set.id],
        );
        for (const type of CORE_RULE_TYPES) {
          const rule = rules.find((r) => r.rule_type === type);
          if (!rule) {
            f.push({
              area: 'statutory',
              severity: 'warning',
              code: 'missing_rule_type',
              owner: 'Legal',
              subject: `${code} / ${type}`,
              message: `${set.name} has no ${type} rule.`,
            });
          } else if (!rule.leave_type_id && type !== 'annual_leave') {
            f.push({
              area: 'statutory',
              severity: 'blocker',
              code: 'rule_not_linked_to_leave_type',
              owner: 'HR',
              subject: `${code} / ${type}`,
              message: `${type} rule in ${set.name} is not linked to a leave type, so it is never applied.`,
            });
          }
        }
        const sick = rules.find((r) => r.rule_type === 'sick_leave');
        if (sick) f.push(...this.checkSickBands(code, sick.settings));
      }
      if (
        active.length &&
        !f.some((x) => x.subject?.startsWith(code) && x.severity === 'blocker')
      ) {
        f.push({
          area: 'statutory',
          severity: 'ok',
          code: 'rule_set_active_verified',
          owner: 'Legal',
          subject: code,
          message: `${code}: one verified rule set is active.`,
        });
      }
    }

    // -------------------------------------------------------- leave types
    const types = await q<{
      id: number;
      code: string;
      name: string;
      is_paid: boolean;
      status: string | null;
      comp_off_enabled: boolean;
      is_carry_forward_allowed: boolean;
      max_carry_forward_days: string | null;
      max_days_per_year: string | null;
    }>(
      `SELECT id, code, name, is_paid, status::text, comp_off_enabled, is_carry_forward_allowed,
              max_carry_forward_days, max_days_per_year
         FROM leave_types WHERE company_id=$1 ORDER BY code`,
    );
    const payrollRules = await q<{ code: string }>(
      `SELECT DISTINCT upper(leave_type_code) code FROM payroll_leave_rules
        WHERE company_id=$1 AND status='ACTIVE' AND effective_from <= $2
          AND (effective_to IS NULL OR effective_to >= $2)`,
      [companyId, asOf],
    );
    const ruleCodes = new Set(payrollRules.map((r) => r.code));
    for (const t of types) {
      const subject = `${t.code} (${t.name})`;
      if (t.comp_off_enabled) {
        f.push({
          area: 'comp_off',
          severity: 'blocker',
          code: 'comp_off_enabled_without_policy',
          owner: 'HR',
          subject,
          message:
            'Compensatory off is switched on for this type, but no approved overtime-to-credit policy exists; no credits will be earned until one is configured and approved.',
        });
      }
      if (t.is_paid === false && !ruleCodes.has(t.code.toUpperCase())) {
        f.push({
          area: 'payroll_mapping',
          severity: 'ok',
          code: 'unpaid_type_default',
          owner: 'Finance',
          subject,
          message:
            'Unpaid type: payroll deducts these days as leave without pay.',
        });
      } else if (!ruleCodes.has(t.code.toUpperCase())) {
        f.push({
          area: 'payroll_mapping',
          severity: 'warning',
          code: 'no_payroll_leave_rule',
          owner: 'Finance',
          subject,
          message:
            'No active payroll leave rule: payroll falls back to the leave type (fully paid). Confirm this is intended.',
        });
      }
      if (t.is_carry_forward_allowed) {
        const max = Number(t.max_carry_forward_days ?? 0);
        const yearly = Number(t.max_days_per_year ?? 0);
        if (!(max > 0)) {
          f.push({
            area: 'carry_forward',
            severity: 'warning',
            code: 'unlimited_carry_forward',
            owner: 'HR',
            subject,
            message:
              'Carry-forward is allowed with no maximum; unused days accumulate without limit unless a policy caps them.',
          });
        } else if (yearly > 0 && max > yearly) {
          f.push({
            area: 'carry_forward',
            severity: 'warning',
            code: 'carry_exceeds_entitlement',
            owner: 'HR',
            subject,
            message: `Carry-forward cap ${max} exceeds the yearly entitlement ${yearly}.`,
          });
        }
      }
    }

    // ----------------------------------------------------------- policies
    const policies = await q<{
      id: number;
      name: string;
      priority: number | null;
      status: string;
    }>(
      `SELECT id, name, priority, status::text FROM leave_policies
        WHERE company_id=$1 AND (effective_from IS NULL OR effective_from <= $2)
          AND (effective_to IS NULL OR effective_to >= $2)`,
      [companyId, asOf],
    );
    if (!policies.length) {
      f.push({
        area: 'policies',
        severity: 'warning',
        code: 'no_effective_policy',
        owner: 'HR',
        message: `No leave policy is effective on ${asOf}; leave-type defaults apply to everyone.`,
      });
    }
    if (this.policyConflicts) {
      for (const message of await this.policyConflicts.conflicts(
        companyId,
        asOf,
      )) {
        f.push({
          area: 'policies',
          severity: 'blocker',
          code: 'policy_conflict',
          owner: 'HR',
          message,
        });
      }
    }

    // ------------------------------------------------------------ finance
    const components = await q<{
      code: string;
      status: string;
      calculation_configuration: Record<string, unknown> | null;
      general_ledger_account_code: string | null;
    }>(
      `SELECT code, status::text, calculation_configuration, general_ledger_account_code
         FROM payroll_components WHERE company_id=$1 AND code = ANY($2)`,
      [companyId, ['LEAVE_ENCASHMENT', 'PUBLIC_HOLIDAY_WORK']],
    );
    for (const code of ['LEAVE_ENCASHMENT', 'PUBLIC_HOLIDAY_WORK']) {
      const c = components.find((x) => x.code === code);
      const config = c?.calculation_configuration ?? {};
      if (!c) {
        f.push({
          area: 'finance',
          severity: 'blocker',
          code: 'payroll_component_missing',
          owner: 'Finance',
          subject: code,
          message: `Payroll component ${code} does not exist; handoff to payroll is blocked.`,
        });
      } else if (c.status !== 'ACTIVE' || config.finance_verified !== true) {
        f.push({
          area: 'finance',
          severity: 'blocker',
          code: 'payroll_component_unconfirmed',
          owner: 'Finance',
          subject: code,
          message: `${code} is ${c.status}${config.finance_verified === true ? '' : ' and not Finance-confirmed (GL, tax, NSSF)'}; payroll handoff stays blocked${config.placeholder_gl === true ? '; GL account is a placeholder' : ''}.`,
        });
      } else {
        f.push({
          area: 'finance',
          severity: 'ok',
          code: 'payroll_component_confirmed',
          owner: 'Finance',
          subject: code,
          message: `${code} is active and Finance-confirmed.`,
        });
      }
    }

    const blocked = new Set<string>();
    for (const x of f.filter((y) => y.severity === 'blocker')) {
      if (x.area === 'comp_off') blocked.add('Compensatory-off earning');
      if (x.area === 'finance') blocked.add(`Payroll handoff (${x.subject})`);
      if (x.area === 'statutory' || x.area === 'sick_pay_bands')
        blocked.add(
          `Statutory rules for ${x.subject?.split(' / ')[0] ?? 'jurisdiction'}`,
        );
      if (x.area === 'policies')
        blocked.add(
          'Leave entitlement for employees with conflicting policies',
        );
    }
    return {
      company_id: companyId,
      generated_at: new Date().toISOString(),
      findings: f,
      blocked_features: [...blocked].sort(),
      summary: {
        ok: f.filter((x) => x.severity === 'ok').length,
        warning: f.filter((x) => x.severity === 'warning').length,
        blocker: f.filter((x) => x.severity === 'blocker').length,
      },
    };
  }

  /** Structural checks only: values themselves need legal confirmation. */
  checkSickBands(
    code: string,
    settings: Record<string, unknown>,
  ): ReadinessFinding[] {
    const out: ReadinessFinding[] = [];
    const stages = (settings?.stages ?? []) as Array<{
      days?: unknown;
      pay_percent?: unknown;
    }>;
    const period = Number(settings?.reference_period_months);
    const bad = (message: string) =>
      out.push({
        area: 'sick_pay_bands',
        severity: 'blocker',
        code: 'invalid_sick_bands',
        owner: 'Legal',
        subject: code,
        message,
      });
    if (!Array.isArray(stages) || !stages.length)
      bad(`${code}: sick-leave rule has no pay stages.`);
    stages.forEach((s, i) => {
      const days = Number(s.days);
      const pct = Number(s.pay_percent);
      if (!(days > 0))
        bad(`${code}: sick pay stage ${i + 1} has no positive day count.`);
      if (!(pct >= 0 && pct <= 100))
        bad(
          `${code}: sick pay stage ${i + 1} pay percent ${String(s.pay_percent)} is outside 0–100.`,
        );
      if (i > 0 && pct > Number(stages[i - 1].pay_percent))
        out.push({
          area: 'sick_pay_bands',
          severity: 'warning',
          code: 'sick_bands_increase',
          owner: 'Legal',
          subject: code,
          message: `${code}: sick pay stage ${i + 1} pays more than stage ${i}; confirm against the legal source.`,
        });
    });
    if (!(period > 0))
      bad(`${code}: sick-leave reference period (months) is not set.`);
    return out;
  }

  static toMarkdown(r: ReadinessReport): string {
    const lines = [
      `# Leave configuration readiness — company ${r.company_id}`,
      '',
      `Generated ${r.generated_at}. Blockers: ${r.summary.blocker}, warnings: ${r.summary.warning}, ok: ${r.summary.ok}.`,
      '',
      '## Features blocked from activation',
      '',
      ...(r.blocked_features.length
        ? r.blocked_features.map((b) => `- ${b}`)
        : ['- None']),
      '',
      '## Findings',
      '',
      '| Severity | Area | Subject | Owner | Finding |',
      '| --- | --- | --- | --- | --- |',
      ...r.findings
        .sort(
          (a, b) =>
            ['blocker', 'warning', 'ok'].indexOf(a.severity) -
            ['blocker', 'warning', 'ok'].indexOf(b.severity),
        )
        .map(
          (x) =>
            `| ${x.severity} | ${x.area} | ${x.subject ?? ''} | ${x.owner} | ${x.message.replace(/\|/g, '\\|')} |`,
        ),
    ];
    return lines.join('\n');
  }
}
