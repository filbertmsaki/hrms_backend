import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { Employee } from '../../employees/entities/employee.entity';
import type { LeaveFamily } from '../entities/leave-ledger-entry.entity';
import { mainlandHolidays as holidaysConfig } from '../config/mainland-holidays';
import { addDays, daysBetween, round2, round4 } from '../utils/mainland-leave-engine';
import { resolveMonthlyBasicWage } from '../utils/mainland-payroll.util';
import { LeaveAuditService } from './leave-audit.service';
import { MainlandLeaveService } from './mainland-leave.service';

type BalanceRow = Awaited<ReturnType<MainlandLeaveService['getBalance']>>;

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return '';
  const head = Object.keys(rows[0]);
  return [head.join(','), ...rows.map((r) => head.map((h) => csvCell(r[h])).join(','))].join('\n');
};

/**
 * Mainland reports. Every figure is derived from the ledger through
 * MainlandLeaveService.getBalance, so report totals reconcile to the ledger;
 * scope follows HrAccessService (managers see their reports only).
 */
@Injectable()
export class MainlandReportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly mainland: MainlandLeaveService,
    private readonly access: HrAccessService,
    private readonly audit: LeaveAuditService,
  ) {}

  /** Mainland-assigned employees visible to the actor. */
  private async employees(companyId: number, actor: AuthenticatedUser, asOf: string, departmentId?: number) {
    const rows = (await this.dataSource.query(
      `SELECT DISTINCT ON (a.employee_id) a.employee_id FROM leave_policy_assignments a
         JOIN employees e ON e.id = a.employee_id
        WHERE a.company_id = $1 AND a.effective_date <= $2 AND ($3::int IS NULL OR e.primary_department_id = $3)
        ORDER BY a.employee_id, a.effective_date DESC, a.id DESC`,
      [companyId, asOf, departmentId ?? null],
    )) as { employee_id: number }[];
    const list = await this.dataSource.getRepository(Employee).find({ where: rows.map((r) => ({ id: r.employee_id, company_id: companyId })) });
    const visible: Employee[] = [];
    for (const e of list) {
      try {
        await this.access.assertCanAccessEmployee(actor, e);
        visible.push(e);
      } catch {
        /* out of scope */
      }
    }
    return visible;
  }

  async balances(companyId: number, actor: AuthenticatedUser, input: { asOf: string; family: LeaveFamily; departmentId?: number }) {
    const emps = await this.employees(companyId, actor, input.asOf, input.departmentId);
    const rows: Record<string, unknown>[] = [];
    for (const e of emps) {
      const b = (await this.mainland.getBalance(companyId, e.id, input.family, input.asOf)) as BalanceRow & Record<string, unknown>;
      if (b.status !== 'mainland') continue;
      const x = b as Extract<BalanceRow, { status: 'mainland' }>;
      rows.push({
        employee_id: e.id,
        employee_no: e.employee_no,
        name: `${e.first_name} ${e.last_name}`,
        department_id: e.primary_department_id ?? null,
        as_of: input.asOf,
        cycle_start: x.cycle?.startDate ?? null,
        cycle_end: x.cycle?.endDate ?? null,
        entitlement: x.entitlement,
        accrued: x.accrued,
        carried: x.carried,
        taken: x.taken,
        pending: x.pending,
        scheduled: x.scheduled,
        expired_flagged: x.expired_flagged,
        forfeited: x.forfeited,
        paid_out: x.paid_out,
        balance: x.balance,
        available: x.available,
        projected_unposted_accrual: x.projected.unposted_accrual,
      });
    }
    const sum = (k: string) => round4(rows.reduce((s, r) => s + Number(r[k] ?? 0), 0));
    const byDepartment = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const k = String(r.department_id ?? 'none');
      const d = byDepartment.get(k) ?? { employees: 0, balance: 0, available: 0, taken: 0 };
      d.employees += 1;
      d.balance = round4(d.balance + Number(r.balance));
      d.available = round4(d.available + Number(r.available));
      d.taken = round4(d.taken + Number(r.taken));
      byDepartment.set(k, d);
    }
    return {
      as_of: input.asOf,
      family: input.family,
      rows,
      departments: [...byDepartment.entries()].map(([department_id, v]) => ({ department_id, ...v })),
      totals: { employees: rows.length, balance: sum('balance'), available: sum('available'), taken: sum('taken'), pending: sum('pending'), scheduled: sum('scheduled'), expired_flagged: sum('expired_flagged') },
    };
  }

  /** Daily / weekly / monthly / per-cycle as-of series for one employee. */
  async series(companyId: number, employeeId: number, family: LeaveFamily, from: string, to: string, granularity: 'daily' | 'weekly' | 'monthly' | 'cycle') {
    if (daysBetween(from, to) > 800 || to < from) throw new BadRequestException('Range must be 0–800 days');
    const points: string[] = [];
    if (granularity === 'cycle') {
      let d = from;
      while (d <= to) {
        const b = await this.mainland.getBalance(companyId, employeeId, family, d);
        const end = (b as { cycle?: { endDate: string } | null }).cycle?.endDate;
        points.push(end && end < to ? end : to);
        if (!end || end >= to) break;
        d = addDays(end, 1);
      }
    } else {
      for (let d = from; d <= to; ) {
        points.push(d);
        if (granularity === 'daily') d = addDays(d, 1);
        else if (granularity === 'weekly') d = addDays(d, 7);
        else {
          const dt = new Date(`${d}T00:00:00Z`);
          d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 2, 0)).toISOString().slice(0, 10);
          if (points[points.length - 1] === d) d = addDays(d, 1);
        }
      }
    }
    const out: Record<string, unknown>[] = [];
    for (const p of [...new Set(points)]) {
      const b = (await this.mainland.getBalance(companyId, employeeId, family, p)) as Record<string, unknown>;
      out.push({ as_of: p, balance: b.balance, available: b.available, taken: b.taken, accrued: b.accrued });
    }
    return out;
  }

  /** Annual leave liability at the effective wage (balance × monthly basic / divisor). */
  async liability(companyId: number, actor: AuthenticatedUser, asOf: string, departmentId?: number) {
    const report = await this.balances(companyId, actor, { asOf, family: 'annual', departmentId });
    const rows: Record<string, any>[] = [];
    for (const r of report.rows) {
      const wage = await resolveMonthlyBasicWage(this.dataSource.manager, companyId, Number(r.employee_id), asOf);
      const resolved = await this.mainland.getBalance(companyId, Number(r.employee_id), 'annual', asOf);
      const divisor = resolved.status === 'mainland' ? (await this.divisor(companyId, Number(r.employee_id), asOf)) : 26;
      const days = Math.max(0, Number(r.balance) + Number(r.projected_unposted_accrual));
      rows.push({ ...r, liability_days: round4(days), monthly_basic: wage.ok ? wage.monthlyBasic : null, currency: wage.ok ? wage.currency : null, liability_amount: wage.ok ? round2((days * wage.monthlyBasic) / divisor) : null, wage_issue: wage.ok ? null : wage.reason });
    }
    const byCurrency: Record<string, number> = {};
    for (const r of rows) if (r.currency) byCurrency[String(r.currency)] = round2((byCurrency[String(r.currency)] ?? 0) + Number(r.liability_amount ?? 0));
    return { as_of: asOf, rows, totals: { by_currency: byCurrency, missing_wage: rows.filter((r) => r.wage_issue).length } };
  }

  private async divisor(companyId: number, employeeId: number, asOf: string) {
    const r = (await this.dataSource.query(
      `SELECT (r.rules->'termination'->>'monthly_wage_divisor')::numeric AS d FROM leave_policy_assignments a
         JOIN leave_policy_revisions r ON r.policy_id = a.policy_id AND r.effective_date <= $3 AND r.withdrawn_at IS NULL
        WHERE a.company_id = $1 AND a.employee_id = $2 AND a.effective_date <= $3
        ORDER BY a.effective_date DESC, r.effective_date DESC LIMIT 1`,
      [companyId, employeeId, asOf],
    )) as { d: string }[];
    return Number(r[0]?.d ?? 26);
  }

  /** Carry-over buckets expiring within N days (30/60/90). */
  async expiring(companyId: number, actor: AuthenticatedUser, asOf: string, withinDays: number) {
    const emps = await this.employees(companyId, actor, asOf);
    const rows: Record<string, any>[] = [];
    for (const e of emps) {
      const b = await this.mainland.getBalance(companyId, e.id, 'annual', asOf);
      if (b.status !== 'mainland') continue;
      for (const k of (b as Extract<BalanceRow, { status: 'mainland' }>).buckets)
        if (k.expires_on && k.remaining > 0 && k.status !== 'forfeited' && daysBetween(asOf, k.expires_on) <= withinDays)
          rows.push({ employee_id: e.id, employee_no: e.employee_no, name: `${e.first_name} ${e.last_name}`, source_cycle_start: k.source_cycle_start, expires_on: k.expires_on, days_to_expiry: daysBetween(asOf, k.expires_on), remaining: k.remaining, status: k.status });
    }
    return { as_of: asOf, within_days: withinDays, rows, total_days: round4(rows.reduce((s, r) => s + r.remaining, 0)) };
  }

  async sickTiers(companyId: number, actor: AuthenticatedUser, asOf: string) {
    const emps = await this.employees(companyId, actor, asOf);
    const rows: Record<string, any>[] = [];
    for (const e of emps) {
      const b = (await this.mainland.getBalance(companyId, e.id, 'sick', asOf)) as Record<string, unknown> & { status: string };
      if (b.status !== 'mainland') continue;
      const tiers = (b.tier_usage as { pay_rate: number; days: number }[]) ?? [];
      rows.push({ employee_id: e.id, employee_no: e.employee_no, name: `${e.first_name} ${e.last_name}`, cycle_start: (b.cycle as { startDate?: string } | null)?.startDate ?? null, full_pay_days: tiers.find((t) => t.pay_rate === 1)?.days ?? 0, half_pay_days: tiers.find((t) => t.pay_rate === 0.5)?.days ?? 0, unpaid_days: tiers.find((t) => t.pay_rate === 0)?.days ?? 0, total_taken: b.taken, remaining: (b.sick_remaining as { total?: number } | undefined)?.total ?? null });
    }
    return { as_of: asOf, rows };
  }

  async maternityTerms(companyId: number, actor: AuthenticatedUser, asOf: string) {
    const emps = await this.employees(companyId, actor, asOf);
    const rows: Record<string, any>[] = [];
    for (const e of emps) {
      const used = await this.mainland.maternityTermsUsed(this.dataSource.manager, companyId, e.id);
      if (used > 0) rows.push({ employee_id: e.id, employee_no: e.employee_no, name: `${e.first_name} ${e.last_name}`, paid_terms_used: used });
    }
    return { as_of: asOf, rows };
  }

  /**
   * Seed statutory Mainland holidays into a company-wide group. A marker per
   * seed key means rows HR later edited or deleted are never re-created.
   */
  async seedHolidays(companyId: number, actor: AuthenticatedUser) {
    return this.dataSource.transaction(async (m) => {
      let group = ((await m.query(`SELECT id FROM holiday_groups WHERE company_id = $1 AND name = $2`, [companyId, 'Tanzania Mainland (statutory)'])) as { id: number }[])[0];
      if (!group)
        group = ((await m.query(`INSERT INTO holiday_groups (company_id, name, description) VALUES ($1, $2, $3) RETURNING id`, [companyId, 'Tanzania Mainland (statutory)', holidaysConfig.source])) as { id: number }[])[0];
      const created: string[] = [];
      for (const h of holidaysConfig.holidays) {
        const marker = (await m.query(`INSERT INTO leave_notification_log (company_id, dedupe_key, recipients) VALUES ($1, $2, '[]') ON CONFLICT DO NOTHING RETURNING id`, [companyId, `holiday-seed:mainland:${h.key}`])) as unknown[];
        if (!marker.length) continue;
        const ins = (await m.query(
          `INSERT INTO attendance_holidays (company_id, holiday_group_id, name, date, is_recurring, type, is_paid, affects_overtime, counts_as_working_day, branch_id, is_provisional, jurisdiction, seed_key)
           VALUES ($1, $2, $3, $4, false, $5, true, true, false, NULL, $6, 'mainland', $7) ON CONFLICT DO NOTHING RETURNING id`,
          [companyId, group.id, h.name, h.date, h.type, h.provisional, `mainland:${h.key}`],
        )) as unknown[];
        if (ins.length) created.push(h.key);
      }
      await this.audit.log({ company_id: companyId, action: 'leave_holidays.mainland_seeded', entity_name: 'holiday_group', entity_id: group.id, actor, payload: { created, provisional: holidaysConfig.holidays.filter((h) => h.provisional).map((h) => h.key) } }, m);
      return { holiday_group_id: group.id, created, skipped: holidaysConfig.holidays.length - created.length };
    });
  }

  /**
   * HR check of the Mainland calendar: every Mainland holiday with its
   * provisional flag and days until it, plus seeded holidays HR deleted.
   * Provisional holidays inside `withinDays` need confirmation.
   */
  async holidayReview(companyId: number, asOf: string, withinDays = 60) {
    const rows = (await this.dataSource.query(
      `SELECT ah.id, ah.name, ah.date::text AS date, ah.is_provisional, ah.seed_key, ah.branch_id, (ah.date - $2::date) AS days_until
         FROM attendance_holidays ah WHERE ah.company_id = $1 AND ah.jurisdiction = 'mainland' ORDER BY ah.date`,
      [companyId, asOf],
    )) as { id: number; name: string; date: string; is_provisional: boolean; seed_key: string | null; branch_id: number | null; days_until: number }[];
    const markers = new Set(
      ((await this.dataSource.query(`SELECT dedupe_key FROM leave_notification_log WHERE company_id = $1 AND dedupe_key LIKE 'holiday-seed:mainland:%'`, [companyId])) as { dedupe_key: string }[]).map(
        (r) => r.dedupe_key.slice('holiday-seed:mainland:'.length),
      ),
    );
    const present = new Set(rows.map((r) => r.seed_key));
    const deleted = holidaysConfig.holidays.filter((h) => markers.has(h.key) && !present.has(`mainland:${h.key}`)).map((h) => ({ key: h.key, name: h.name, seeded_date: h.date }));
    return {
      as_of: asOf,
      rows: rows.map((r) => ({ ...r, days_until: Number(r.days_until), needs_check: r.is_provisional && Number(r.days_until) >= 0 && Number(r.days_until) <= withinDays })),
      deleted_seeded: deleted,
    };
  }

  /**
   * HR confirms a Mainland holiday after the government announcement,
   * optionally moving it. Clears the provisional flag and is audited. Leave
   * requests touching the old or new date are returned for HR to review,
   * because working-day counts may change; they are not recalculated here.
   */
  async confirmHoliday(companyId: number, actor: AuthenticatedUser, id: number, input: { date?: string | null; reason: string; evidence?: string | null }) {
    return this.dataSource.transaction(async (m) => {
      const [row] = (await m.query(
        `SELECT id, name, date::text AS date, is_provisional, branch_id FROM attendance_holidays WHERE id = $1 AND company_id = $2 AND jurisdiction = 'mainland' FOR UPDATE`,
        [id, companyId],
      )) as { id: number; name: string; date: string; is_provisional: boolean; branch_id: number | null }[];
      if (!row) throw new BadRequestException('Mainland holiday not found');
      const newDate = input.date ?? row.date;
      if (newDate !== row.date) {
        const clash = (await m.query(
          `SELECT id FROM attendance_holidays WHERE company_id = $1 AND date = $2 AND id <> $3 AND jurisdiction = 'mainland' AND branch_id IS NOT DISTINCT FROM $4`,
          [companyId, newDate, id, row.branch_id],
        )) as unknown[];
        if (clash.length) throw new BadRequestException(`Another Mainland holiday is already on ${newDate}`);
      }
      await m.query(`UPDATE attendance_holidays SET date = $1, is_provisional = false, updated_at = now() WHERE id = $2`, [newDate, id]);
      const affected = (await m.query(
        `SELECT r.id, r.leave_no, r.employee_id, r.status, r.start_date::text AS start_date, r.end_date::text AS end_date FROM leave_requests r
          WHERE r.company_id = $1 AND r.status NOT IN ('rejected','cancelled','draft')
            AND (($2::date BETWEEN r.start_date AND r.end_date) OR ($3::date BETWEEN r.start_date AND r.end_date))
          ORDER BY r.start_date`,
        [companyId, row.date, newDate],
      )) as Record<string, unknown>[];
      await this.audit.log(
        {
          company_id: companyId,
          action: 'leave_holidays.mainland_confirmed',
          entity_name: 'attendance_holiday',
          entity_id: id,
          actor,
          payload: { name: row.name, from_date: row.date, to_date: newDate, was_provisional: row.is_provisional, reason: input.reason, evidence: input.evidence ?? null, affected_request_ids: affected.map((a) => a.id) },
        },
        m,
      );
      return { id, name: row.name, from_date: row.date, date: newDate, is_provisional: false, affected_requests: affected };
    });
  }

  toCsv = toCsv;
}
