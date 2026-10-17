import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OnboardingRequest } from '../onboarding/entities/onboarding-request.entity';
import { isOnboardingTaskReady } from '../onboarding/utils/workflow-readiness';
import { onboardingActionVisibilitySql } from '../onboarding/utils/workflow-visibility';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { ActionItem } from './entities/action-item.entity';
import { ActionItemStatusEnum } from './enums/action-item-status.enum';
import { ActionItemTypeEnum } from './enums/action-item-type.enum';
import { ActionItemQueryDto } from './dtos/action-item-query.dto';

export interface UpsertActionItemInput {
  companyId: number;
  assigneeCompanyUserId: number;
  assigneeEmployeeId?: number | null;

  actionType: ActionItemTypeEnum;

  sourceModule: string;
  sourceEntityType: string;
  sourceEntityId: string | number;
  sourceKey: string;

  title: string;
  description?: string | null;
  priority?: string;

  branchId?: number | null;
  departmentId?: number | null;

  actionUrl?: string | null;
  dueAt?: Date | null;

  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class ActionItemsService {
  constructor(
    @InjectRepository(ActionItem)
    private readonly repository: Repository<ActionItem>,
  ) {}

  async upsertOpen(input: UpsertActionItemInput): Promise<ActionItem> {
    const existing = await this.repository.findOne({
      where: {
        companyId: input.companyId,
        assigneeCompanyUserId: input.assigneeCompanyUserId,
        sourceKey: input.sourceKey,
      },
    });

    if (existing) {
      existing.title = input.title;
      existing.description = input.description ?? null;
      existing.priority = input.priority ?? 'MEDIUM';
      existing.actionUrl = input.actionUrl ?? null;
      existing.dueAt = input.dueAt ?? null;
      existing.metadata = input.metadata ?? null;

      if (
        existing.status === ActionItemStatusEnum.COMPLETED ||
        existing.status === ActionItemStatusEnum.CANCELLED
      ) {
        existing.status = ActionItemStatusEnum.OPEN;
        existing.openedAt = new Date();
        existing.completedAt = null;
      }

      return this.repository.save(existing);
    }

    return this.repository.save(
      this.repository.create({
        companyId: input.companyId,
        assigneeCompanyUserId: input.assigneeCompanyUserId,
        assigneeEmployeeId: input.assigneeEmployeeId ?? null,
        actionType: input.actionType,
        sourceModule: input.sourceModule,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: String(input.sourceEntityId),
        sourceKey: input.sourceKey,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? 'MEDIUM',
        status: ActionItemStatusEnum.OPEN,
        branchId: input.branchId ?? null,
        departmentId: input.departmentId ?? null,
        actionUrl: input.actionUrl ?? null,
        dueAt: input.dueAt ?? null,
        openedAt: new Date(),
        completedAt: null,
        metadata: input.metadata ?? null,
      }),
    );
  }

  async completeBySource(companyId: number, sourceKey: string): Promise<void> {
    await this.repository.update(
      { companyId, sourceKey, status: ActionItemStatusEnum.OPEN },
      { status: ActionItemStatusEnum.COMPLETED, completedAt: new Date() },
    );
  }

  async cancelBySource(companyId: number, sourceKey: string): Promise<void> {
    await this.repository.update(
      { companyId, sourceKey },
      { status: ActionItemStatusEnum.CANCELLED, completedAt: new Date() },
    );
  }

  /**
   * Completes every still-open action item tied to a source record,
   * regardless of which specific assignee/approver key was used to create
   * it. Needed because outcome events (approved/rejected/completed) don't
   * always carry the exact approver id that opened the item.
   */
  async completeAllOpenForEntity(
    companyId: number,
    sourceModule: string,
    sourceEntityType: string,
    sourceEntityId: string | number,
  ): Promise<void> {
    await this.repository.update(
      {
        companyId,
        sourceModule,
        sourceEntityType,
        sourceEntityId: String(sourceEntityId),
        status: ActionItemStatusEnum.OPEN,
      },
      { status: ActionItemStatusEnum.COMPLETED, completedAt: new Date() },
    );
  }

  async findMine(actor: AuthenticatedUser, query: ActionItemQueryDto) {
    if (!actor.companyId || !actor.companyMembershipId) {
      throw new NotFoundException('Active company membership is required.');
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const qb = this.repository
      .createQueryBuilder('item')
      .where('item.company_id = :companyId', { companyId: actor.companyId })
      .andWhere('item.assignee_company_user_id = :membershipId', {
        membershipId: actor.companyMembershipId,
      })
      .andWhere(onboardingActionVisibilitySql());

    if (query.status) {
      qb.andWhere('item.status = :status', { status: query.status });
    }

    if (query.source_module) {
      qb.andWhere('item.source_module = :sourceModule', {
        sourceModule: query.source_module,
      });
    }

    const [items, total] = await qb
      .orderBy(
        `CASE
           WHEN item.priority = 'URGENT' THEN 1
           WHEN item.priority = 'HIGH' THEN 2
           WHEN item.priority = 'MEDIUM' THEN 3
           ELSE 4
         END`,
        'ASC',
      )
      .addOrderBy('item.due_at', 'ASC', 'NULLS LAST')
      .addOrderBy('item.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const taskItems = items.filter(
      (item) => item.sourceEntityType === 'ONBOARDING_TASK',
    );
    const requestIds = [
      ...new Set(
        taskItems
          .map((item) => Number(item.metadata?.onboarding_request_id))
          .filter((id) => id > 0),
      ),
    ];
    const requests = requestIds.length
      ? await this.repository.manager.getRepository(OnboardingRequest).find({
          where: { company_id: actor.companyId, id: In(requestIds) },
          relations: { tasks: { workflow_step: true }, approvals: true },
        })
      : [];
    const data = items.map((item) => {
      if (item.sourceEntityType !== 'ONBOARDING_TASK') return item;
      const request = requests.find(
        (entry) => entry.id === Number(item.metadata?.onboarding_request_id),
      );
      const task = request?.tasks.find(
        (entry) => entry.id === Number(item.sourceEntityId),
      );
      return {
        ...item,
        is_actionable: Boolean(
          request && task && isOnboardingTaskReady(request, task),
        ),
      };
    });
    return {
      data,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async countOpen(companyId: number, companyUserId: number): Promise<number> {
    return this.repository
      .createQueryBuilder('item')
      .where('item.company_id = :companyId', { companyId })
      .andWhere('item.assignee_company_user_id = :companyUserId', {
        companyUserId,
      })
      .andWhere('item.status = :status', { status: ActionItemStatusEnum.OPEN })
      .andWhere(onboardingActionVisibilitySql())
      .getCount();
  }
}
