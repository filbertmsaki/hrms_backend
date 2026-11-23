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
import { AccessScheduleTemplatesService } from '../access-schedule-templates/service/access-schedule-templates.service';
import { AccessWeekPlansService } from '../access-week-plans/service/access-week-plans.service';

export type ScheduleKind = 'week-plan' | 'template';
type Job = {
  company_id: number;
  kind: ScheduleKind;
  resource_id: number;
  device_id: number;
  user_id: number | null;
  membership_id: number | null;
  revision: number;
  verified_revision: number;
  configuration: { device_id?: number; deleted?: boolean };
};
type State = { enabled: boolean; verified_revision: number; result: string };
const latest = `JOIN LATERAL (SELECT revision,configuration FROM access_schedule_revisions r WHERE r.company_id=j.company_id AND r.kind=j.kind AND r.resource_id=j.resource_id ORDER BY revision DESC LIMIT 1) r ON true`;

@Injectable()
export class ScheduleDeploymentsService {
  constructor(
    private readonly db: DataSource,
    private readonly locks: PostgresAdvisoryLockService,
    private readonly companies: CompaniesService,
    private readonly weeks: AccessWeekPlansService,
    private readonly templates: AccessScheduleTemplatesService,
  ) {}

  private allowed(kind: ScheduleKind, permissions: string[]) {
    return [
      'access_control_sync:execute',
      'data_scope:company',
      kind === 'week-plan'
        ? 'access_week_plans:update'
        : 'access_schedule_templates:update',
    ].every((key) => hasPermission(permissions, key));
  }

  async state(
    actor: AuthenticatedUser,
    kind: ScheduleKind,
    id: number,
  ): Promise<State> {
    if (!this.allowed(kind, actor.permissions)) throw new ForbiddenException();
    const [row]: State[] = await this.db.query(
      'SELECT j.enabled,j.verified_revision,j.result FROM access_schedule_deployments j WHERE j.company_id=$1 AND j.kind=$2 AND j.resource_id=$3',
      [actor.companyId, kind, id],
    );
    return (
      row ?? {
        enabled: false,
        verified_revision: 0,
        result: 'Manual deployment',
      }
    );
  }

  async configure(
    actor: AuthenticatedUser,
    kind: ScheduleKind,
    id: number,
    enabled: boolean,
    expectedRevision: number,
  ) {
    if (
      !actor.companyId ||
      !actor.companyMembershipId ||
      !this.allowed(kind, actor.permissions)
    )
      throw new ForbiddenException();
    const company = actor.companyId;
    const lock = await this.locks.runWithLock(
      this.lockKey(company, kind, id),
      async () => {
        if (!enabled) {
          await this.db.query(
            "UPDATE access_schedule_deployments SET enabled=false,user_id=$4,membership_id=$5,result='Paused',updated_at=now() WHERE company_id=$1 AND kind=$2 AND resource_id=$3",
            [company, kind, id, actor.id, actor.companyMembershipId],
          );
          return;
        }
        const [revision]: Array<{ revision: number; device_id: number }> =
          await this.db.query(
            `SELECT r.revision,d.id AS device_id FROM (SELECT revision,configuration FROM access_schedule_revisions WHERE company_id=$1 AND kind=$2 AND resource_id=$3 ORDER BY revision DESC LIMIT 1) r JOIN attendance_devices d ON d.id=(r.configuration->>'device_id')::int AND d.company_id=$1 AND UPPER(d.status::text)='ACTIVE'`,
            [company, kind, id],
          );
        if (!revision)
          throw new NotFoundException(
            'Choose a schedule assigned to an active device in this company.',
          );
        if (revision.revision !== expectedRevision)
          throw new ConflictException(
            'This schedule changed. Review its latest revision.',
          );
        await this.db.query(
          `INSERT INTO access_schedule_deployments(company_id,kind,resource_id,device_id,user_id,membership_id,enabled) VALUES($1,$2,$3,$4,$5,$6,true)
        ON CONFLICT(company_id,kind,resource_id) DO UPDATE SET enabled=true,device_id=EXCLUDED.device_id,user_id=EXCLUDED.user_id,membership_id=EXCLUDED.membership_id,verified_revision=0,updated_at=now(),result='Pending',next_attempt_at=now()`,
          [
            company,
            kind,
            id,
            revision.device_id,
            actor.id,
            actor.companyMembershipId,
          ],
        );
      },
    );
    if (!lock.acquired)
      throw new ConflictException(
        'A deployment is running for this schedule. Try again when it completes.',
      );
    return this.state(actor, kind, id);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async run() {
    const due: Array<{
      company_id: number;
      kind: ScheduleKind;
      resource_id: number;
    }> = await this.db.query(
      `SELECT j.company_id,j.kind,j.resource_id FROM access_schedule_deployments j ${latest} WHERE j.enabled AND j.next_attempt_at<=now() AND j.verified_revision<r.revision ORDER BY j.next_attempt_at,j.resource_id LIMIT 12`,
    );
    for (const key of due)
      await this.locks.runWithLock(
        this.lockKey(key.company_id, key.kind, key.resource_id),
        () => this.deploy(key.company_id, key.kind, key.resource_id),
      );
  }

  private lockKey(company: number, kind: ScheduleKind, id: number) {
    return `access-schedule-deploy-${company}-${kind}-${id}`;
  }

  private async deploy(company: number, kind: ScheduleKind, id: number) {
    const key = [company, kind, id];
    const [job]: Job[] = await this.db.query(
      `SELECT j.*,r.revision,r.configuration FROM access_schedule_deployments j ${latest} WHERE j.company_id=$1 AND j.kind=$2 AND j.resource_id=$3 AND j.enabled AND j.next_attempt_at<=now() AND j.verified_revision<r.revision`,
      key,
    );
    if (!job) return;
    let result =
      'Device verification failed. Check the connection and schedule.';
    let enabled = true;
    let verified = job.verified_revision;
    try {
      if (
        job.configuration.deleted ||
        job.configuration.device_id !== job.device_id
      )
        throw new BadRequestException(
          'The schedule was removed or assigned to a different device.',
        );
      if (!job.user_id || !job.membership_id) throw new ForbiddenException();
      const actor = await this.companies.getMembershipContext(
        job.user_id,
        company,
      );
      if (
        actor.membershipId !== job.membership_id ||
        !this.allowed(kind, actor.permissions)
      )
        throw new ForbiddenException();
      const [device]: Array<{ active: boolean }> = await this.db.query(
        "SELECT upper(d.status::text)='ACTIVE' AND c.status='active' AS active FROM attendance_devices d JOIN companies c ON c.id=d.company_id WHERE d.company_id=$1 AND d.id=$2 AND d.deleted_at IS NULL",
        [company, job.device_id],
      );
      if (!device?.active)
        throw new BadRequestException(
          'The device is inactive or unavailable in this company.',
        );
      const response =
        kind === 'week-plan'
          ? await this.weeks.syncWeekPlanToDevice(company, id, job.device_id)
          : await this.templates.syncTemplateToDevice(
              company,
              id,
              job.device_id,
            );
      if (response.ok) {
        verified = job.revision;
        result = 'Verified on device';
      } else result = response.message;
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        enabled = false;
        result =
          error instanceof ForbiddenException
            ? 'Paused because the authorizing membership or permission changed.'
            : error.message;
      }
    }
    await this.db.query(
      `UPDATE access_schedule_deployments SET enabled=$4,verified_revision=$5,result=$6,next_attempt_at=now()+CASE WHEN $5=$7 THEN interval '0 seconds' ELSE interval '5 minutes' END,updated_at=now() WHERE company_id=$1 AND kind=$2 AND resource_id=$3`,
      [...key, enabled, verified, result, job.revision],
    );
  }
}
