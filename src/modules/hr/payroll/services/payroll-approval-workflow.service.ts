import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { getRequestAuditContext } from '../../../../common/request-context/request-context';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  PayrollApprovalDelegation,
  PayrollApprovalWorkflow,
  PayrollApprovalWorkflowScopeEnum,
  PayrollApprovalWorkflowStage,
} from '../entities/payroll-approval-workflow.entities';
import { PayrollAuditLog } from '../entities/payroll-run.entities';
import {
  PayrollApprovalStageEnum,
  PayrollRunStatusEnum,
} from '../payroll.enums';
import { PayrollMoney } from './payroll-money.util';

/** Snapshot copied onto a run when it is calculated. */
export type PayrollApprovalWorkflowSnapshot = {
  workflow_id: number | null;
  version_number: number | null;
  name: string;
  stages: PayrollApprovalWorkflowStage[];
  delegations: PayrollApprovalDelegation[];
};

export const DEFAULT_APPROVAL_STAGES: PayrollApprovalWorkflowStage[] = [
  { stage: PayrollApprovalStageEnum.HR },
  { stage: PayrollApprovalStageEnum.FINANCE },
  { stage: PayrollApprovalStageEnum.MANAGEMENT },
];

export function pendingStatusForStage(stage: PayrollApprovalStageEnum) {
  return stage === PayrollApprovalStageEnum.HR
    ? PayrollRunStatusEnum.PENDING_HR_APPROVAL
    : stage === PayrollApprovalStageEnum.FINANCE
      ? PayrollRunStatusEnum.PENDING_FINANCE_APPROVAL
      : PayrollRunStatusEnum.PENDING_MANAGEMENT_APPROVAL;
}

/** Workflow stored on a run, or the historical HR → Finance → Management. */
export function runApprovalWorkflow(run: {
  configurationSnapshot?: Record<string, unknown> | null;
}): PayrollApprovalWorkflowSnapshot {
  const stored = run.configurationSnapshot?.approval_workflow as
    | PayrollApprovalWorkflowSnapshot
    | undefined;
  if (stored?.stages?.length) return stored;
  return {
    workflow_id: null,
    version_number: null,
    name: 'Default (HR → Finance → Management)',
    stages: DEFAULT_APPROVAL_STAGES,
    delegations: [],
  };
}

export function nextStatusAfterStage(
  workflow: PayrollApprovalWorkflowSnapshot,
  stage: PayrollApprovalStageEnum,
) {
  const index = workflow.stages.findIndex((item) => item.stage === stage);
  const next = workflow.stages[index + 1];
  return next
    ? pendingStatusForStage(next.stage)
    : PayrollRunStatusEnum.APPROVED;
}

/**
 * Checks the configured approver list (honouring active delegations) and the
 * stage's amount limit. Maker-checker and one-person-one-stage are enforced
 * separately by the run service and always apply.
 */
export function assertStageAuthority(args: {
  workflow: PayrollApprovalWorkflowSnapshot;
  stage: PayrollApprovalStageEnum;
  actorCompanyUserId: number;
  netPayTotal: string;
  today?: string;
}) {
  const config = args.workflow.stages.find((item) => item.stage === args.stage);
  if (!config) {
    throw new ForbiddenException(
      'This approval stage is not part of the run workflow.',
    );
  }
  const allowed = config.approver_company_user_ids ?? [];
  if (allowed.length > 0 && !allowed.includes(args.actorCompanyUserId)) {
    const today = args.today ?? new Date().toISOString().slice(0, 10);
    const delegated = (args.workflow.delegations ?? []).some(
      (delegation) =>
        delegation.to_company_user_id === args.actorCompanyUserId &&
        allowed.includes(delegation.from_company_user_id) &&
        delegation.starts_on <= today &&
        delegation.ends_on >= today,
    );
    if (!delegated) {
      throw new ForbiddenException(
        'You are not a configured approver (or active delegate) for this stage.',
      );
    }
  }
  if (
    config.max_net_pay_total &&
    PayrollMoney.toCents(args.netPayTotal) >
      PayrollMoney.toCents(config.max_net_pay_total)
  ) {
    throw new ForbiddenException(
      `Net pay total exceeds this stage's approval limit of ${config.max_net_pay_total}.`,
    );
  }
}

export type SavePayrollApprovalWorkflowInput = {
  scope: PayrollApprovalWorkflowScopeEnum;
  branch_id?: number | null;
  payroll_group_id?: number | null;
  name: string;
  stages: PayrollApprovalWorkflowStage[];
  delegations?: PayrollApprovalDelegation[] | null;
};

@Injectable()
export class PayrollApprovalWorkflowService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(PayrollApprovalWorkflow)
    private readonly repository: Repository<PayrollApprovalWorkflow>,
    @Optional()
    @InjectRepository(PayrollAuditLog)
    private readonly auditRepository?: Repository<PayrollAuditLog>,
  ) {}

  list(actor: AuthenticatedUser, includeRetired = false) {
    return this.repository.find({
      where: {
        companyId: this.hrAccessService.ensureActorCompanyId(actor),
        ...(includeRetired ? {} : { status: 'ACTIVE' as const }),
      },
      order: { scope: 'ASC', id: 'DESC' },
    });
  }

  /** Creates a new version for the scope and retires the previous one. */
  async save(actor: AuthenticatedUser, dto: SavePayrollApprovalWorkflowInput) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    this.validate(dto);
    const scopeWhere = {
      companyId,
      scope: dto.scope,
      branchId:
        dto.scope === PayrollApprovalWorkflowScopeEnum.BRANCH
          ? dto.branch_id!
          : (null as unknown as number),
      payrollGroupId:
        dto.scope === PayrollApprovalWorkflowScopeEnum.PAYROLL_GROUP
          ? dto.payroll_group_id!
          : (null as unknown as number),
    };
    return this.repository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(PayrollApprovalWorkflow);
      const current = await repository
        .createQueryBuilder('workflow')
        .setLock('pessimistic_write')
        .where('workflow.companyId = :companyId', { companyId })
        .andWhere('workflow.scope = :scope', { scope: dto.scope })
        .andWhere('workflow.status = :status', { status: 'ACTIVE' })
        .andWhere(
          scopeWhere.branchId === null
            ? 'workflow.branchId IS NULL'
            : 'workflow.branchId = :branchId',
          { branchId: scopeWhere.branchId },
        )
        .andWhere(
          scopeWhere.payrollGroupId === null
            ? 'workflow.payrollGroupId IS NULL'
            : 'workflow.payrollGroupId = :groupId',
          { groupId: scopeWhere.payrollGroupId },
        )
        .getOne();
      if (current) {
        current.status = 'RETIRED';
        await repository.save(current);
      }
      const saved = await repository.save(
        repository.create({
          ...scopeWhere,
          name: dto.name.trim(),
          stages: dto.stages.map((stage) => ({
            stage: stage.stage,
            label: stage.label?.trim() || null,
            approver_company_user_ids: stage.approver_company_user_ids?.length
              ? [...new Set(stage.approver_company_user_ids.map(Number))]
              : null,
            max_net_pay_total: stage.max_net_pay_total
              ? PayrollMoney.add(stage.max_net_pay_total)
              : null,
          })),
          delegations: dto.delegations?.length ? dto.delegations : null,
          versionNumber: (current?.versionNumber ?? 0) + 1,
          status: 'ACTIVE',
          createdByCompanyUserId: actor.companyMembershipId ?? actor.id,
        }),
      );
      if (this.auditRepository) {
        await manager.getRepository(PayrollAuditLog).save(
          manager.getRepository(PayrollAuditLog).create({
            companyId,
            actorCompanyUserId: actor.companyMembershipId ?? null,
            action: 'payroll.approval_workflow.saved',
            entityType: 'PAYROLL_APPROVAL_WORKFLOW',
            entityId: String(saved.id),
            summary: {
              scope: saved.scope,
              version_number: saved.versionNumber,
            },
            beforeValues: current
              ? { id: current.id, stages: current.stages }
              : null,
            afterValues: { id: saved.id, stages: saved.stages },
            ipAddress: getRequestAuditContext().ipAddress?.slice(0, 64) ?? null,
          }),
        );
      }
      return saved;
    });
  }

  /** Most specific active workflow: payroll group, then branch, then company. */
  async resolveSnapshot(
    companyId: number,
    context: { payrollGroupId?: number | null; branchId?: number | null },
  ): Promise<PayrollApprovalWorkflowSnapshot> {
    const active = await this.repository.find({
      where: { companyId, status: 'ACTIVE' },
    });
    const match =
      (context.payrollGroupId &&
        active.find(
          (item) =>
            item.scope === PayrollApprovalWorkflowScopeEnum.PAYROLL_GROUP &&
            item.payrollGroupId === context.payrollGroupId,
        )) ||
      (context.branchId &&
        active.find(
          (item) =>
            item.scope === PayrollApprovalWorkflowScopeEnum.BRANCH &&
            item.branchId === context.branchId,
        )) ||
      active.find(
        (item) => item.scope === PayrollApprovalWorkflowScopeEnum.COMPANY,
      );
    if (!match) return runApprovalWorkflow({});
    return {
      workflow_id: match.id,
      version_number: match.versionNumber,
      name: match.name,
      stages: match.stages,
      delegations: match.delegations ?? [],
    };
  }

  private validate(dto: SavePayrollApprovalWorkflowInput) {
    if (!dto.name?.trim()) throw new BadRequestException('A name is required.');
    if (!Array.isArray(dto.stages) || dto.stages.length === 0) {
      throw new BadRequestException('At least one approval stage is required.');
    }
    const seen = new Set<string>();
    for (const stage of dto.stages) {
      if (!Object.values(PayrollApprovalStageEnum).includes(stage.stage)) {
        throw new BadRequestException(`Unknown approval stage ${stage.stage}.`);
      }
      if (seen.has(stage.stage)) {
        throw new BadRequestException('Each stage may appear only once.');
      }
      seen.add(stage.stage);
      if (
        stage.max_net_pay_total &&
        PayrollMoney.toCents(stage.max_net_pay_total) <= 0n
      ) {
        throw new BadRequestException('Approval limits must be positive.');
      }
    }
    if (
      dto.scope === PayrollApprovalWorkflowScopeEnum.BRANCH &&
      !dto.branch_id
    ) {
      throw new BadRequestException('Branch workflows need a branch.');
    }
    if (
      dto.scope === PayrollApprovalWorkflowScopeEnum.PAYROLL_GROUP &&
      !dto.payroll_group_id
    ) {
      throw new BadRequestException('Payroll-group workflows need a group.');
    }
    for (const delegation of dto.delegations ?? []) {
      if (delegation.from_company_user_id === delegation.to_company_user_id) {
        throw new BadRequestException('A user cannot delegate to themselves.');
      }
      if (
        !delegation.starts_on ||
        !delegation.ends_on ||
        delegation.ends_on < delegation.starts_on
      ) {
        throw new BadRequestException('Delegations need a valid date range.');
      }
    }
  }
}
