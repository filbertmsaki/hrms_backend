import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../common/database/postgres-advisory-lock.service';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../common/utils/permission.util';
import { CompaniesService } from '../../companies/companies.service';
import { HikvisionUserManagementService } from '../../hikvision/hikvision-user-management.service';
import { DeviceAccessWriteLockService } from '../../hikvision/device-access-write-lock.service';
import {
  CardStatusReconciliationService,
  DeviceReviewRequired as ReviewRequired,
} from './card-status-reconciliation.service';
import { AccessControlSyncService } from './access-control-sync.service';
import { deviceRightsReadback } from './device-rights-readback';
import {
  planReconciliationRights,
  recoverPendingWrite,
  ReconciliationRight,
} from './reconciliation-rights-planner';

type Job = {
  id: number;
  company_id: number;
  employee_id: number | null;
  device_id: number;
  credential_id: number | null;
  reason: string;
  user_id: number | null;
  membership_id: number | null;
  attempt_count: number;
};
type Owner = {
  device_employee_no: string;
  managed_rights: ReconciliationRight[];
  pending_before: ReconciliationRight[] | null;
  pending_after: ReconciliationRight[] | null;
  pending_managed: ReconciliationRight[] | null;
};
const grants = [
  'access_control_sync:execute',
  'access_groups:update',
  'employee_device_assignments:update',
  'data_scope:company',
];
const due = `FROM access_reconciliation_operations o
  JOIN access_device_reconciliation_policies p ON p.company_id=o.company_id AND p.device_id=o.device_id AND p.enabled AND o.created_at>=p.enabled_at
  WHERE o.status IN ('PENDING_REVIEW','RETRY','RUNNING') AND (o.next_attempt_at IS NULL OR o.next_attempt_at<=now()) AND (o.effective_date IS NULL OR o.effective_date<=CURRENT_DATE)`;

@Injectable()
export class DeviceReconciliationService {
  constructor(
    private readonly db: DataSource,
    private readonly locks: PostgresAdvisoryLockService,
    private readonly companies: CompaniesService,
    private readonly access: AccessControlSyncService,
    private readonly devices: HikvisionUserManagementService,
    private readonly deviceLock: DeviceAccessWriteLockService,
    private readonly cards: CardStatusReconciliationService,
  ) {}

  private requireAccess(permissions: string[]) {
    if (!grants.every((p) => hasPermission(permissions, p)))
      throw new ForbiddenException(
        'Reader automation requires synchronization, device-assignment and group management permissions with company scope.',
      );
  }
  private key(company: number, device: number) {
    return `reader-reconciliation-${company}-${device}`;
  }

  async state(actor: AuthenticatedUser, device: number) {
    this.requireAccess(actor.permissions);
    const [row]: { enabled: boolean }[] = await this.db.query(
      'SELECT p.enabled FROM access_device_reconciliation_policies p WHERE company_id=$1 AND device_id=$2',
      [actor.companyId, device],
    );
    return { enabled: row?.enabled ?? false };
  }
  async configure(actor: AuthenticatedUser, device: number, enabled: boolean) {
    this.requireAccess(actor.permissions);
    if (!actor.companyId || !actor.companyMembershipId)
      throw new ForbiddenException();
    const company = actor.companyId;
    const change = await this.locks.runWithLock(
      this.key(company, device),
      async () => {
        const [reader]: { active: boolean }[] = await this.db.query(
          "SELECT upper(status::text)='ACTIVE' AS active FROM attendance_devices WHERE id=$2 AND company_id=$1 AND deleted_at IS NULL",
          [company, device],
        );
        if (!reader)
          throw new NotFoundException(
            'Reader not found in the active company.',
          );
        if (enabled && !reader.active)
          throw new BadRequestException(
            'Activate the reader before enabling reconciliation.',
          );
        await this.db.query(
          `INSERT INTO access_device_reconciliation_policies(company_id,device_id,enabled,user_id,membership_id) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(company_id,device_id) DO UPDATE SET enabled=EXCLUDED.enabled,user_id=EXCLUDED.user_id,membership_id=EXCLUDED.membership_id,
        enabled_at=CASE WHEN access_device_reconciliation_policies.enabled THEN access_device_reconciliation_policies.enabled_at ELSE now() END`,
          [company, device, enabled, actor.id, actor.companyMembershipId],
        );
      },
    );
    if (!change.acquired)
      throw new ConflictException(
        'A reader operation is running. Retry when it finishes.',
      );
    return { enabled };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async run() {
    const keys: Array<{ id: number; company_id: number; device_id: number }> =
      await this.db.query(
        `SELECT o.id,o.company_id,o.device_id ${due} ORDER BY o.id LIMIT 24`,
      );
    for (const key of keys)
      await this.locks.runWithLock(
        this.key(key.company_id, key.device_id),
        () => this.process(key.id, key.company_id, key.device_id),
      );
  }
  private async process(id: number, company: number, device: number) {
    const [job]: Job[] = await this.db.query(
      `SELECT o.*,p.user_id,p.membership_id ${due} AND o.id=$1 AND o.company_id=$2 AND o.device_id=$3`,
      [id, company, device],
    );
    if (!job) return;
    await this.db.query(
      "UPDATE access_reconciliation_operations SET status='RUNNING',attempt_count=attempt_count+1,started_at=now(),next_attempt_at=now()+interval '1 minute' WHERE id=$1",
      [id],
    );
    let status = 'VERIFIED',
      message: string | null = null;
    try {
      if (!job.user_id || !job.membership_id) throw new ForbiddenException();
      const actor = await this.companies.getMembershipContext(
        job.user_id,
        company,
      );
      if (actor.membershipId !== job.membership_id)
        throw new ForbiddenException();
      this.requireAccess(actor.permissions);
      if (!job.employee_id)
        throw new ReviewRequired(
          'Link the reader user to an HR employee before reconciling access.',
        );
      if (job.reason === 'CREDENTIAL_CHANGED')
        throw new ReviewRequired(
          'Use the credential-specific reader operation and verify its status. Door access can be shared by several credentials.',
        );
      const employee = job.employee_id;
      if (job.reason === 'CREDENTIAL_STATUS') {
        if (
          !job.credential_id ||
          !hasPermission(
            actor.permissions,
            'employee_access_credentials:update',
          )
        )
          throw new ForbiddenException();
        const credential = job.credential_id;
        await this.deviceLock.run(company, device, () =>
          this.cards.reconcile(company, device, employee, credential),
        );
      } else
        await this.deviceLock.run(company, device, () =>
          this.reconcile(job, employee),
        );
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ReviewRequired
      ) {
        status = 'NEEDS_REVIEW';
        message =
          error instanceof ReviewRequired
            ? error.message
            : 'The authorizing membership, target or device configuration requires review.';
      } else {
        status = job.attempt_count >= 4 ? 'NEEDS_REVIEW' : 'RETRY';
        message = 'Reader communication or verification is incomplete.';
      }
    }
    await this.db.query(
      `UPDATE access_reconciliation_operations SET status=$2,last_error=$3,next_attempt_at=CASE WHEN $2='RETRY' THEN now()+interval '5 minutes' ELSE NULL END,completed_at=CASE WHEN $2='VERIFIED' THEN now() ELSE NULL END,updated_at=now() WHERE id=$1`,
      [id, status, message],
    );
  }

  private async observed(
    company: number,
    device: number,
    employee: number,
    number: string,
  ) {
    const reading = await this.devices.getUserByEmployeeNumber(
      company,
      device,
      number,
    );
    if (
      !reading.exists ||
      reading.user?.employee_no !== number ||
      (reading.user.matched_employee_id != null &&
        reading.user.matched_employee_id !== employee)
    )
      throw new ReviewRequired(
        'The reader identity must match exactly one HR employee.',
      );
    const rights = deviceRightsReadback(reading.user.raw);
    if (!rights)
      throw new ReviewRequired(
        'The reader did not return a complete door and schedule list.',
      );
    return rights;
  }

  private async reconcile(job: Job, employee: number) {
    const company = job.company_id,
      device = job.device_id;
    const desired = await this.access.previewEffectiveAccess(
      company,
      employee,
      device,
    );
    if (!desired.employee_no)
      throw new ReviewRequired(
        'The employee has no device-specific identifier.',
      );
    const number = desired.employee_no;
    const assignments: Array<{ employee_id: number | null }> =
      await this.db.query(
        'SELECT employee_id FROM employee_device_assignments WHERE company_id=$1 AND device_id=$2 AND employee_no=$3 AND deleted_at IS NULL',
        [company, device, number],
      );
    if (assignments.length !== 1 || assignments[0].employee_id !== employee)
      throw new ReviewRequired(
        'The reader user is missing or has ambiguous HR assignments.',
      );
    const active = ['active', 'onboarding'].includes(desired.employment_status);
    if (active && !desired.ready)
      throw new ReviewRequired(
        'Resolve schedule and group conflicts before deployment.',
      );
    const [reader]: Array<{ active: boolean }> = await this.db.query(
      "SELECT upper(status::text)='ACTIVE' AS active FROM attendance_devices WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL",
      [company, device],
    );
    if (!reader?.active) throw new ReviewRequired('The device is inactive.');
    const key = [company, employee, device];
    const before = await this.observed(company, device, employee, number);
    await this.db.query(
      'INSERT INTO access_reconciliation_managed_rights(company_id,employee_id,device_id,device_employee_no) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,employee_id,device_id) DO NOTHING',
      [...key, number],
    );
    const [owner]: Owner[] = await this.db.query(
      'SELECT * FROM access_reconciliation_managed_rights WHERE company_id=$1 AND employee_id=$2 AND device_id=$3',
      key,
    );
    if (owner.device_employee_no !== number)
      throw new ReviewRequired(
        'Reader identity changed. Review the saved ownership record.',
      );
    let managed = owner.managed_rights;
    if (owner.pending_before && owner.pending_after && owner.pending_managed) {
      const recovered = recoverPendingWrite({
        observed: before,
        before: owner.pending_before,
        after: owner.pending_after,
      });
      if (recovered === 'REVIEW')
        throw new ReviewRequired(
          'Reader rights differ from both sides of an interrupted write.',
        );
      if (recovered === 'APPLIED') managed = owner.pending_managed;
      await this.commitOwnership(key, managed);
    }
    const direct = desired.recorded_rights
      .filter((r) => r.origin === 'MANUAL')
      .map((r) => ({ doorNo: r.door_no, templateNo: r.template_no }));
    const group = desired.desired_rights.map((r) => ({
      doorNo: r.door_no,
      templateNo: r.template_no,
    }));
    const target = active ? [...group, ...direct] : [];
    const same = (a: ReconciliationRight, b: ReconciliationRight) =>
      a.doorNo === b.doorNo && a.templateNo === b.templateNo;
    const unknownDirect = desired.recorded_rights
      .filter(
        (r) =>
          r.origin !== 'MANUAL' &&
          r.origin !== 'ACCESS_GROUP' &&
          r.origin !== 'DEVICE_PULL',
      )
      .map((r) => ({ doorNo: r.door_no, templateNo: r.template_no }));
    if (
      unknownDirect.some(
        (r) =>
          managed.some((m) => same(m, r)) && !target.some((t) => same(t, r)),
      )
    )
      throw new ReviewRequired('A direct right has unknown ownership.');
    const plan = planReconciliationRights({
      observed: before,
      desiredGroup: active ? group : [],
      desiredDirect: active ? direct : [],
      previouslyManaged: managed,
    });
    if (plan.state === 'REVIEW') throw new ReviewRequired(plan.reason);
    if (plan.changed) {
      const current = await this.access.previewEffectiveAccess(
        company,
        employee,
        device,
      );
      if (
        current.employee_no !== number ||
        current.desired_version !== desired.desired_version ||
        current.employment_status !== desired.employment_status ||
        current.ready !== desired.ready ||
        JSON.stringify(current.recorded_rights) !==
          JSON.stringify(desired.recorded_rights)
      )
        throw new Error('Desired access changed during the device inspection');
      await this.db.query(
        'UPDATE access_reconciliation_managed_rights SET pending_before=$4,pending_after=$5,pending_managed=$6,updated_at=now() WHERE company_id=$1 AND employee_id=$2 AND device_id=$3',
        [
          ...key,
          JSON.stringify(before),
          JSON.stringify(plan.desired),
          JSON.stringify(plan.managedAfter),
        ],
      );
      await this.devices.updateUserOnDevice(company, device, {
        employee_no: number,
        door_right: plan.desired.map((r) => r.doorNo).join(','),
        right_plan: plan.desired.map((r) => ({
          door_no: r.doorNo,
          plan_template_no: r.templateNo,
        })),
      });
      const after = await this.observed(company, device, employee, number);
      if (
        recoverPendingWrite({
          observed: after,
          before,
          after: plan.desired,
        }) !== 'APPLIED'
      )
        throw new Error('Unverified device write');
    }
    await this.commitOwnership(key, plan.managedAfter);
    if (
      (!active || /REMOVED|STATUS|TRANSFER/.test(job.reason)) &&
      plan.desired.some((r) => !target.some((t) => same(t, r)))
    )
      throw new ReviewRequired(
        'HRMS-managed rights have been reconciled. Independently configured rights remain on this reader.',
      );
  }
  private async commitOwnership(key: number[], managed: ReconciliationRight[]) {
    await this.db.query(
      'UPDATE access_reconciliation_managed_rights SET managed_rights=$4,pending_before=NULL,pending_after=NULL,pending_managed=NULL,verified_at=now(),updated_at=now() WHERE company_id=$1 AND employee_id=$2 AND device_id=$3',
      [...key, JSON.stringify(managed)],
    );
  }
}
