import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager, IsNull, LessThanOrEqual } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveEmployeeProfile } from '../entities/leave-employee-profile.entity';
import { LeavePolicyDraftRevision } from '../entities/leave-policy-draft-revision.entity';
import {
  LeavePolicyAssignment,
  LeavePolicyRevision,
} from '../entities/leave-policy-revision.entity';
import { LeavePolicy } from '../entities/leave-policy.entity';
import {
  EmployeeLeaveContext,
  MainlandPolicy,
} from '../utils/mainland-leave-engine';
import { validateMainlandPolicyDraft } from '../utils/mainland-policy-draft-validation.util';
import { LeaveAuditService } from './leave-audit.service';

export const LEAVE_TIMEZONE = 'Africa/Dar_es_Salaam';
export function leaveToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LEAVE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value);
}
export const sha256 = (s: string) =>
  createHash('sha256').update(s).digest('hex');

export type ResolvedLeaveContext =
  | {
      status: 'mainland';
      profile: LeaveEmployeeProfile;
      assignment: LeavePolicyAssignment;
      revision: LeavePolicyRevision;
      policy: MainlandPolicy;
      ctx: EmployeeLeaveContext;
    }
  | {
      /** Legacy engine applies (no Mainland assignment yet, or Zanzibar). */
      status: 'legacy';
      reason: string;
    }
  | { status: 'blocked'; issues: string[] };

/**
 * Policy revisions (approve/withdraw), employee policy assignments, and the
 * as-of resolver every Mainland calculation goes through.
 */
@Injectable()
export class LeavePolicyRevisionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: LeaveAuditService,
  ) {}

  async listRevisions(companyId: number, policyId: number) {
    return this.dataSource.getRepository(LeavePolicyRevision).find({
      where: { company_id: companyId, policy_id: policyId },
      order: { effective_date: 'DESC', id: 'DESC' },
    });
  }

  /** Four-eyes approval of a draft; the approver must not be its author. */
  async approveDraft(
    companyId: number,
    draftId: number,
    actor: AuthenticatedUser,
    input: { jurisdiction: 'mainland' | 'zanzibar'; reason: string },
  ) {
    const reason = input.reason?.trim();
    if (!reason || !actor.companyMembershipId)
      throw new BadRequestException(
        'A reason and company membership are required',
      );
    return this.dataSource.transaction(async (m) => {
      const draft = await m.getRepository(LeavePolicyDraftRevision).findOne({
        where: { id: draftId, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!draft) throw new NotFoundException('Draft revision not found');
      if (draft.created_by_company_user_id === actor.companyMembershipId)
        throw new ForbiddenException(
          'A draft must be approved by someone other than its author',
        );
      if (draft.proposed_effective_date < leaveToday())
        throw new BadRequestException(
          'Effective date has already passed; revisions cannot be backdated',
        );
      const errors = validateMainlandPolicyDraft(
        draft.rules,
        draft.proposed_effective_date,
      );
      if (errors.length)
        throw new BadRequestException({
          message: 'Draft failed validation',
          errors,
        });
      const repo = m.getRepository(LeavePolicyRevision);
      const clash = await repo.findOne({
        where: {
          policy_id: draft.policy_id,
          effective_date: draft.proposed_effective_date,
          withdrawn_at: IsNull(),
        },
      });
      if (clash)
        throw new ConflictException(
          'An approved revision already exists for that date',
        );
      const revision = await repo.save(
        repo.create({
          company_id: companyId,
          policy_id: draft.policy_id,
          jurisdiction: input.jurisdiction,
          effective_date: draft.proposed_effective_date,
          rules: draft.rules,
          rules_sha256: sha256(canonicalJson(draft.rules)),
          source_draft_revision_id: draft.id,
          approved_by_company_user_id: actor.companyMembershipId,
          approval_reason: reason,
        }),
      );
      await this.audit.log(
        {
          company_id: companyId,
          action: 'leave_policy_revision.approved',
          entity_name: 'leave_policy',
          entity_id: draft.policy_id,
          actor,
          payload: {
            revision_id: revision.id,
            draft_id: draft.id,
            effective_date: revision.effective_date,
            rules_sha256: revision.rules_sha256,
            reason,
          },
        },
        m,
      );
      return revision;
    });
  }

  /** Only a not-yet-effective revision can be withdrawn; history is kept. */
  async withdraw(
    companyId: number,
    revisionId: number,
    actor: AuthenticatedUser,
    reason: string,
  ) {
    if (!reason?.trim() || !actor.companyMembershipId)
      throw new BadRequestException('A reason is required');
    return this.dataSource.transaction(async (m) => {
      const repo = m.getRepository(LeavePolicyRevision);
      const rev = await repo.findOne({
        where: { id: revisionId, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!rev) throw new NotFoundException('Revision not found');
      if (rev.withdrawn_at)
        throw new ConflictException('Revision already withdrawn');
      if (rev.effective_date <= leaveToday())
        throw new BadRequestException(
          'An effective revision cannot be withdrawn; approve a new revision instead',
        );
      rev.withdrawn_at = new Date();
      rev.withdrawn_by_company_user_id = actor.companyMembershipId ?? null;
      rev.withdrawal_reason = reason.trim();
      await repo.save(rev);
      await this.audit.log(
        {
          company_id: companyId,
          action: 'leave_policy_revision.withdrawn',
          entity_name: 'leave_policy',
          entity_id: rev.policy_id,
          actor,
          payload: { revision_id: rev.id, reason },
        },
        m,
      );
      return rev;
    });
  }

  async assignmentHistory(companyId: number, employeeId: number) {
    return this.dataSource.getRepository(LeavePolicyAssignment).find({
      where: { company_id: companyId, employee_id: employeeId },
      order: { effective_date: 'DESC', id: 'DESC' },
    });
  }

  /**
   * Assign employees to a policy from a date. Mainland assignments require an
   * approved cutover snapshot (activation gate); nobody switches by default.
   */
  async assign(
    companyId: number,
    actor: AuthenticatedUser,
    input: {
      employeeIds: number[];
      policyId: number;
      effectiveDate: string;
      reason: string;
      cutoverSnapshotId?: number | null;
    },
    gate: (
      m: EntityManager,
      employeeIds: number[],
      snapshotId: number | null | undefined,
      date: string,
    ) => Promise<void> = () => {
      return Promise.reject(
        new BadRequestException(
          'Mainland activation requires an approved cutover snapshot',
        ),
      );
    },
  ) {
    if (!input.reason?.trim() || !actor.companyMembershipId)
      throw new BadRequestException('A reason is required');
    if (!input.employeeIds.length || input.employeeIds.length > 2000)
      throw new BadRequestException('Provide 1–2000 employees');
    return this.dataSource.transaction(async (m) => {
      const policy = await m
        .getRepository(LeavePolicy)
        .findOne({ where: { id: input.policyId, company_id: companyId } });
      if (!policy) throw new NotFoundException('Leave policy not found');
      const revision = await this.revisionAsOf(
        m,
        companyId,
        input.policyId,
        input.effectiveDate,
      );
      if (!revision)
        throw new BadRequestException(
          'No approved policy revision is effective on that date',
        );
      const employees = await m.getRepository(Employee).find({
        where: input.employeeIds.map((id) => ({ id, company_id: companyId })),
      });
      if (employees.length !== new Set(input.employeeIds).size)
        throw new NotFoundException('One or more employees not found');
      const issues: string[] = [];
      for (const e of employees) {
        const profile = await this.profileAsOf(
          m,
          companyId,
          e.id,
          input.effectiveDate,
        );
        if (!profile)
          issues.push(
            `Employee ${e.id}: no leave profile (jurisdiction/FTE) effective ${input.effectiveDate}`,
          );
        else if (profile.jurisdiction !== revision.jurisdiction)
          issues.push(
            `Employee ${e.id}: profile jurisdiction ${profile.jurisdiction} does not match policy ${revision.jurisdiction}`,
          );
        if (!e.hire_date) issues.push(`Employee ${e.id}: missing hire date`);
      }
      if (issues.length)
        throw new BadRequestException({
          message: 'Assignment blocked',
          issues,
        });
      if (revision.jurisdiction === 'mainland')
        await gate(
          m,
          input.employeeIds,
          input.cutoverSnapshotId,
          input.effectiveDate,
        );
      const repo = m.getRepository(LeavePolicyAssignment);
      const rows = await repo.save(
        input.employeeIds.map((employeeId) =>
          repo.create({
            company_id: companyId,
            employee_id: employeeId,
            policy_id: input.policyId,
            effective_date: input.effectiveDate,
            reason: input.reason.trim(),
            cutover_snapshot_id: input.cutoverSnapshotId ?? null,
            created_by_company_user_id: actor.companyMembershipId!,
          }),
        ),
      );
      await this.audit.logMany(
        rows.map((r) => ({
          company_id: companyId,
          action: 'leave_policy_assignment.created',
          entity_name: 'employee',
          entity_id: r.employee_id,
          actor,
          payload: {
            assignment_id: r.id,
            policy_id: r.policy_id,
            effective_date: r.effective_date,
            revision_id: revision.id,
            reason: r.reason,
          },
        })),
        m,
      );
      return { assigned: rows.length, revision_id: revision.id };
    });
  }

  revisionAsOf(
    m: EntityManager,
    companyId: number,
    policyId: number,
    date: string,
  ) {
    return m.getRepository(LeavePolicyRevision).findOne({
      where: {
        company_id: companyId,
        policy_id: policyId,
        effective_date: LessThanOrEqual(date),
        withdrawn_at: IsNull(),
      },
      order: { effective_date: 'DESC', id: 'DESC' },
    });
  }

  profileAsOf(
    m: EntityManager,
    companyId: number,
    employeeId: number,
    date: string,
  ) {
    return m.getRepository(LeaveEmployeeProfile).findOne({
      where: {
        company_id: companyId,
        employee_id: employeeId,
        effective_date: LessThanOrEqual(date),
      },
      order: { effective_date: 'DESC', id: 'DESC' },
    });
  }

  /**
   * Resolve profile → assignment → revision effective on `date`. Never
   * assumes Mainland or full time: missing data blocks with explicit issues.
   */
  async resolve(
    companyId: number,
    employeeId: number,
    date: string,
    m: EntityManager = this.dataSource.manager,
  ): Promise<ResolvedLeaveContext> {
    const assignment = await m.getRepository(LeavePolicyAssignment).findOne({
      where: {
        company_id: companyId,
        employee_id: employeeId,
        effective_date: LessThanOrEqual(date),
      },
      order: { effective_date: 'DESC', id: 'DESC' },
    });
    if (!assignment)
      return {
        status: 'legacy',
        reason: 'No effective-dated policy assignment',
      };
    const revision = await this.revisionAsOf(
      m,
      companyId,
      assignment.policy_id,
      date,
    );
    if (!revision)
      return {
        status: 'blocked',
        issues: ['Assigned policy has no approved revision for this date'],
      };
    if (revision.jurisdiction !== 'mainland')
      return {
        status: 'legacy',
        reason: `Jurisdiction ${revision.jurisdiction}`,
      };
    const profile = await this.profileAsOf(m, companyId, employeeId, date);
    const employee = await m
      .getRepository(Employee)
      .findOne({ where: { id: employeeId, company_id: companyId } });
    const issues: string[] = [];
    if (!employee) issues.push('Employee not found');
    if (!profile) issues.push('Missing leave profile (jurisdiction/FTE)');
    else if (profile.jurisdiction !== 'mainland')
      issues.push('Profile jurisdiction is not Mainland');
    if (employee && !employee.hire_date) issues.push('Missing hire date');
    if (issues.length || !profile || !employee)
      return { status: 'blocked', issues };
    const unpaidBlocks = await m.query<{ start: string; end: string }[]>(
      `SELECT r.start_date::text AS start, r.end_date::text AS "end"
         FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id
        WHERE r.company_id = $1 AND r.employee_id = $2 AND r.status = 'approved'
          AND t.is_paid = false`,
      [companyId, employeeId],
    );
    return {
      status: 'mainland',
      profile,
      assignment,
      revision,
      policy: revision.rules as unknown as MainlandPolicy,
      ctx: {
        hireDate: String(employee.hire_date).slice(0, 10),
        cycleAnchorDate: profile.cycle_anchor_date,
        fte: Number(profile.fte),
        previousEmploymentPeriods: profile.previous_employment_periods,
        terminationDate: employee.exit_date
          ? String(employee.exit_date).slice(0, 10)
          : null,
        unpaidBlocks,
      },
    };
  }

  /** Active employees with no profile as of a date (surfaced to HR). */
  async missingProfiles(companyId: number, date: string) {
    return this.dataSource.query<
      {
        id: number;
        employee_no: string;
        first_name: string;
        last_name: string;
        hire_date: string | null;
      }[]
    >(
      `SELECT e.id, e.employee_no, e.first_name, e.last_name, e.hire_date
         FROM employees e
        WHERE e.company_id = $1 AND (e.exit_date IS NULL OR e.exit_date >= $2)
          AND NOT EXISTS (SELECT 1 FROM leave_employee_profiles p
                           WHERE p.company_id = e.company_id AND p.employee_id = e.id AND p.effective_date <= $2)
        ORDER BY e.id LIMIT 1000`,
      [companyId, date],
    ) as Promise<unknown[]>;
  }
}
