import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { LeavePolicyDraftRevision } from '../entities/leave-policy-draft-revision.entity';
import { LeavePolicy } from '../entities/leave-policy.entity';
import { LeaveAuditService } from './leave-audit.service';
import { validateMainlandPolicyDraft } from '../utils/mainland-policy-draft-validation.util';

@Injectable()
export class LeavePolicyDraftService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: LeaveAuditService,
  ) {}

  async list(companyId: number, policyId: number) {
    const policy = await this.dataSource.getRepository(LeavePolicy).findOne({
      where: { id: policyId, company_id: companyId },
      select: ['id'],
    });
    if (!policy) throw new NotFoundException('Leave policy not found');
    return this.dataSource.getRepository(LeavePolicyDraftRevision).find({
      where: { company_id: companyId, policy_id: policyId },
      order: { id: 'DESC' },
      take: 100,
    });
  }

  async validate(
    companyId: number,
    policyId: number,
    date: string,
    rules: Record<string, unknown>,
  ) {
    const policy = await this.dataSource.getRepository(LeavePolicy).findOne({
      where: { id: policyId, company_id: companyId },
      select: ['id'],
    });
    if (!policy) throw new NotFoundException('Leave policy not found');
    const errors = validateMainlandPolicyDraft(rules, date);
    return {
      schema_valid: errors.length === 0,
      errors,
      activation_available: false,
    };
  }

  async create(
    companyId: number,
    policyId: number,
    actor: AuthenticatedUser,
    input: {
      proposedEffectiveDate: string;
      rules: Record<string, unknown>;
      reason: string;
    },
  ) {
    const reason = input.reason.trim();
    if (!reason || !actor.companyMembershipId)
      throw new BadRequestException(
        'A reason and company membership are required',
      );
    const date = input.proposedEffectiveDate;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    )
      throw new BadRequestException(
        'Proposed effective date must be a valid ISO date',
      );
    if (
      !input.rules ||
      typeof input.rules !== 'object' ||
      Array.isArray(input.rules) ||
      Object.keys(input.rules).length === 0 ||
      Buffer.byteLength(JSON.stringify(input.rules), 'utf8') > 65536
    )
      throw new BadRequestException(
        'Rules must be a nonempty JSON object of at most 64 KiB',
      );
    return this.dataSource.transaction(async (manager) => {
      const policy = await manager.getRepository(LeavePolicy).findOne({
        where: { id: policyId, company_id: companyId },
        select: ['id'],
      });
      if (!policy) throw new NotFoundException('Leave policy not found');
      const repository = manager.getRepository(LeavePolicyDraftRevision);
      const revision = await repository.save(
        repository.create({
          company_id: companyId,
          policy_id: policyId,
          proposed_effective_date: date,
          rules: input.rules,
          reason,
          created_by_company_user_id: actor.companyMembershipId,
        }),
      );
      await this.audit.log(
        {
          company_id: companyId,
          action: 'leave_policy_draft.created',
          entity_name: 'leave_policy',
          entity_id: policyId,
          actor,
          payload: {
            draft_revision_id: revision.id,
            proposed_effective_date: date,
            reason,
          },
        },
        manager,
      );
      return {
        ...revision,
        active: false,
        validation_errors: validateMainlandPolicyDraft(input.rules, date),
      };
    });
  }
}
