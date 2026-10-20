import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { ActionItemIssueReportedEvent } from '../notifications/events/action-item.events';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
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
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async upsertOpen(input: UpsertActionItemInput): Promise<ActionItem> {
    return this.repository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ActionItem);
      const existing = await repository.findOne({
        where: {
          companyId: input.companyId,
          assigneeCompanyUserId: input.assigneeCompanyUserId,
          sourceKey: input.sourceKey,
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (existing) {
        existing.title = input.title;
        existing.description = input.description ?? null;
        existing.priority = input.priority ?? 'MEDIUM';
        existing.actionUrl = input.actionUrl ?? null;
        existing.dueAt = input.dueAt ?? null;
        existing.metadata = {
          ...input.metadata,
          ...(existing.metadata?.issue_comments
            ? { issue_comments: existing.metadata.issue_comments }
            : {}),
        };

        if (
          existing.status === ActionItemStatusEnum.COMPLETED ||
          existing.status === ActionItemStatusEnum.CANCELLED
        ) {
          existing.status = ActionItemStatusEnum.OPEN;
          existing.openedAt = new Date();
          existing.completedAt = null;
        }

        return repository.save(existing);
      }

      return repository.save(
        repository.create({
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
    });
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

    const taskItems = items.filter((item) =>
      ['ONBOARDING_TASK', 'ONBOARDING_REQUEST'].includes(item.sourceEntityType),
    );
    const requestIds = [
      ...new Set(
        taskItems
          .map((item) =>
            Number(
              item.sourceEntityType === 'ONBOARDING_REQUEST'
                ? item.sourceEntityId
                : item.metadata?.onboarding_request_id,
            ),
          )
          .filter((id) => id > 0),
      ),
    ];
    const requests = requestIds.length
      ? await this.repository.manager.getRepository(OnboardingRequest).find({
          where: { company_id: actor.companyId, id: In(requestIds) },
          relations: {
            tasks: { workflow_step: true },
            approvals: true,
            employee: { primary_department: true, primary_position: true },
          },
        })
      : [];
    const offboardingIds = items
      .filter((item) => item.sourceModule === 'offboarding')
      .map((item) =>
        Number(
          item.sourceEntityType === 'OFFBOARDING_REQUEST'
            ? item.sourceEntityId
            : item.metadata?.offboarding_request_id,
        ),
      )
      .filter((id) => id > 0);
    const offboardingRequests = offboardingIds.length
      ? await this.repository.manager.getRepository(OffboardingRequest).find({
          where: { company_id: actor.companyId, id: In(offboardingIds) },
          relations: {
            employee: { primary_department: true, primary_position: true },
            tasks: true,
          },
        })
      : [];
    const leaveIds = items
      .filter((item) => item.sourceEntityType === 'LEAVE_REQUEST')
      .map((item) => Number(item.sourceEntityId))
      .filter((id) => id > 0);
    const leaveRequests = leaveIds.length
      ? await this.repository.manager.getRepository(LeaveRequest).find({
          where: { company_id: actor.companyId, id: In(leaveIds) },
          relations: {
            employee: { primary_department: true, primary_position: true },
          },
        })
      : [];
    const data = items.map((item) => {
      const request = requests.find(
        (entry) =>
          entry.id ===
          Number(
            item.sourceEntityType === 'ONBOARDING_REQUEST'
              ? item.sourceEntityId
              : item.metadata?.onboarding_request_id,
          ),
      );
      const offboarding = offboardingRequests.find(
        (entry) =>
          entry.id ===
          Number(
            item.sourceEntityType === 'OFFBOARDING_REQUEST'
              ? item.sourceEntityId
              : item.metadata?.offboarding_request_id,
          ),
      );
      const leave =
        item.sourceEntityType === 'LEAVE_REQUEST'
          ? leaveRequests.find(
              (entry) => entry.id === Number(item.sourceEntityId),
            )
          : undefined;
      const employee = (request ?? offboarding ?? leave)?.employee;
      const task =
        item.sourceEntityType === 'ONBOARDING_TASK'
          ? request?.tasks.find(
              (entry) => entry.id === Number(item.sourceEntityId),
            )
          : undefined;
      const offboardingTask =
        item.sourceEntityType === 'OFFBOARDING_TASK'
          ? offboarding?.tasks.find(
              (entry) => entry.id === Number(item.sourceEntityId),
            )
          : undefined;
      return {
        ...item,
        subject_employee: employee
          ? {
              id: employee.id,
              name: `${employee.first_name} ${employee.last_name}`.trim(),
              employee_no: employee.employee_no,
              department: employee.primary_department?.name ?? null,
              position: employee.primary_position?.name ?? null,
            }
          : null,
        request_context: {
          reason: (offboarding ?? leave)?.reason ?? null,
          start_date: leave?.start_date ?? null,
          end_date: leave?.end_date ?? null,
          completion_evidence_required:
            (task ?? offboardingTask)?.completion_evidence_required ?? false,
        },
        ...(item.sourceEntityType === 'ONBOARDING_TASK'
          ? {
              is_actionable: Boolean(
                request && task && isOnboardingTaskReady(request, task),
              ),
            }
          : {}),
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

  async reportIssue(actor: AuthenticatedUser, itemId: number, comment: string) {
    if (!actor.companyId || !actor.companyMembershipId)
      throw new NotFoundException('Active company membership is required.');
    const text = comment.trim();
    if (!text || text.length > 2000)
      throw new BadRequestException(
        'Add a comment between 1 and 2000 characters.',
      );
    const entry = {
      id: randomUUID(),
      comment: text,
      author_company_user_id: actor.companyMembershipId,
      author: actor.employeeNo || actor.email,
      created_at: new Date().toISOString(),
    };
    const item = await this.repository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ActionItem);
      const current = await repository.findOne({
        where: {
          id: itemId,
          companyId: actor.companyId,
          assigneeCompanyUserId: actor.companyMembershipId,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) throw new NotFoundException('Action item not found.');
      if (current.status !== ActionItemStatusEnum.OPEN)
        throw new BadRequestException('This action item is already closed.');
      const comments: unknown[] = Array.isArray(
        current.metadata?.issue_comments,
      )
        ? current.metadata.issue_comments
        : [];
      current.metadata = {
        ...current.metadata,
        issue_comments: [...comments, entry],
      };
      return repository.save(current);
    });
    const rawRequestId = item.sourceEntityType.endsWith('_REQUEST')
      ? item.sourceEntityId
      : (item.metadata?.onboarding_request_id ??
        item.metadata?.offboarding_request_id);
    const requestId =
      typeof rawRequestId === 'string' || typeof rawRequestId === 'number'
        ? rawRequestId
        : null;
    const actionUrl =
      requestId && ['onboarding', 'offboarding'].includes(item.sourceModule)
        ? `/dashboard/employees/${item.sourceModule}?tab=requests&request_id=${requestId}`
        : item.actionUrl;
    await this.eventEmitter.emitAsync(
      ActionItemIssueReportedEvent.EVENT,
      new ActionItemIssueReportedEvent(
        actor.companyId,
        item.id,
        item.title,
        text,
        actor.companyMembershipId,
        entry.author,
        item.sourceModule,
        item.sourceEntityType,
        item.sourceEntityId,
        actionUrl,
        entry.id,
      ),
    );
    return entry;
  }
}
