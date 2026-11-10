import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
} from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { LeaveApprovalDelegation } from '../entities/leave-approval-delegation.entity';
import { LeaveAuditService } from './leave-audit.service';

export type DelegationResult = {
  /** Approver who acts. */
  companyUserId: number;
  /** Original approver when delegated. */
  onBehalfOf: number | null;
};

const HR_MANAGE_PERMISSION = 'leave_workflows:update';

/** Maps approvers to their active delegates; de-duplicates the result. */
export function resolveDelegates(
  delegations: Pick<
    LeaveApprovalDelegation,
    'delegator_company_user_id' | 'delegate_company_user_id'
  >[],
  approverIds: number[],
  applicantCompanyUserId: number | null,
): DelegationResult[] {
  const seen = new Set<number>();
  const results: DelegationResult[] = [];
  for (const approverId of approverIds) {
    const delegation = delegations.find(
      (row) =>
        row.delegator_company_user_id === approverId &&
        row.delegate_company_user_id !== applicantCompanyUserId,
    );
    const result: DelegationResult = delegation
      ? {
          companyUserId: delegation.delegate_company_user_id,
          onBehalfOf: approverId,
        }
      : { companyUserId: approverId, onBehalfOf: null };
    if (seen.has(result.companyUserId)) continue;
    seen.add(result.companyUserId);
    results.push(result);
  }
  return results;
}

/** Approver out-of-office cover for leave approvals. */
@Injectable()
export class LeaveDelegationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly leaveAuditService: LeaveAuditService,
  ) {}

  /**
   * Replaces approvers who have an active delegation today. Never assigns
   * the applicant; if the delegate is the applicant, the original stays.
   */
  async applyDelegations(
    companyId: number,
    approverIds: number[],
    applicantCompanyUserId: number | null,
    manager?: EntityManager,
    onDate: string = new Date().toISOString().slice(0, 10),
  ): Promise<DelegationResult[]> {
    if (!approverIds.length) return [];
    const delegations = await (manager ?? this.dataSource.manager)
      .getRepository(LeaveApprovalDelegation)
      .find({
        where: {
          company_id: companyId,
          status: 'active',
          delegator_company_user_id: In(approverIds),
          start_date: LessThanOrEqual(onDate),
          end_date: MoreThanOrEqual(onDate),
        },
        order: { id: 'DESC' },
      });
    return resolveDelegates(delegations, approverIds, applicantCompanyUserId);
  }

  list(companyId: number, actor: AuthenticatedUser, all: boolean) {
    if (all) this.assertHr(actor);
    return this.dataSource.getRepository(LeaveApprovalDelegation).find({
      where: all
        ? { company_id: companyId }
        : [
            {
              company_id: companyId,
              delegator_company_user_id: actor.companyMembershipId!,
            },
            {
              company_id: companyId,
              delegate_company_user_id: actor.companyMembershipId!,
            },
          ],
      order: { start_date: 'DESC', id: 'DESC' },
    });
  }

  async create(
    companyId: number,
    actor: AuthenticatedUser,
    dto: {
      delegator_company_user_id?: number;
      delegate_company_user_id: number;
      start_date: string;
      end_date: string;
      reason?: string | null;
    },
  ) {
    const delegator =
      dto.delegator_company_user_id ?? actor.companyMembershipId!;
    if (delegator !== actor.companyMembershipId) this.assertHr(actor);
    if (delegator === dto.delegate_company_user_id) {
      throw new BadRequestException('Choose someone other than yourself.');
    }
    if (dto.end_date < dto.start_date) {
      throw new BadRequestException('The end date is before the start date.');
    }
    const memberships = await this.dataSource.getRepository(CompanyUser).find({
      where: {
        id: In([delegator, dto.delegate_company_user_id]),
        company_id: companyId,
        status: 'active',
      },
      select: ['id'],
    });
    if (memberships.length !== 2) {
      throw new BadRequestException(
        'Both people must be active users of this company.',
      );
    }
    const repository = this.dataSource.getRepository(LeaveApprovalDelegation);
    const saved = await repository.save(
      repository.create({
        company_id: companyId,
        delegator_company_user_id: delegator,
        delegate_company_user_id: dto.delegate_company_user_id,
        start_date: dto.start_date,
        end_date: dto.end_date,
        reason: dto.reason?.trim() || null,
        status: 'active',
        created_by_company_user_id: actor.companyMembershipId ?? null,
      }),
    );
    await this.audit(companyId, saved, 'leave_delegation.created', actor);
    return saved;
  }

  async cancel(companyId: number, id: number, actor: AuthenticatedUser) {
    const repository = this.dataSource.getRepository(LeaveApprovalDelegation);
    const delegation = await repository.findOne({
      where: { id, company_id: companyId },
    });
    if (!delegation) throw new NotFoundException('Delegation not found');
    if (delegation.delegator_company_user_id !== actor.companyMembershipId) {
      this.assertHr(actor);
    }
    delegation.status = 'cancelled';
    const saved = await repository.save(delegation);
    await this.audit(companyId, saved, 'leave_delegation.cancelled', actor);
    return saved;
  }

  private assertHr(actor: AuthenticatedUser) {
    if (!(actor.permissions ?? []).includes(HR_MANAGE_PERMISSION)) {
      throw new ForbiddenException(
        'Only HR can manage delegations for other people.',
      );
    }
  }

  private audit(
    companyId: number,
    delegation: LeaveApprovalDelegation,
    action: string,
    actor: AuthenticatedUser,
  ) {
    return this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: null,
      action,
      entity_name: 'leave_approval_delegation',
      entity_id: delegation.id,
      actor,
      payload: { ...delegation },
    });
  }
}
