import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../common/database/postgres-advisory-lock.service';
import { LeaveRequestApproval } from '../leave/entities/leave-request-approval.entity';
import { LeaveApprovalStatusEnum } from '../leave/enums/leave-approval-status.enum';
import { OnboardingApproval } from '../onboarding/entities/onboarding-approval.entity';
import { OnboardingApprovalStatusEnum } from '../onboarding/enums/onboarding-approval-status.enum';
import { OffboardingApproval } from '../offboarding/entities/offboarding-approval.entity';
import { OffboardingApprovalStatusEnum } from '../offboarding/enums/offboarding-approval-status.enum';
import { ActionItemsService } from './action-items.service';
import { ActionItemTypeEnum } from './enums/action-item-type.enum';

const RECONCILIATION_LOCK_KEY = 'action-inbox:reconcile';

@Injectable()
export class ActionItemReconciliationService {
  private readonly logger = new Logger(ActionItemReconciliationService.name);

  constructor(
    private readonly advisoryLockService: PostgresAdvisoryLockService,
    private readonly actionItemsService: ActionItemsService,
    @InjectRepository(LeaveRequestApproval)
    private readonly leaveApprovalRepository: Repository<LeaveRequestApproval>,
    @InjectRepository(OnboardingApproval)
    private readonly onboardingApprovalRepository: Repository<OnboardingApproval>,
    @InjectRepository(OffboardingApproval)
    private readonly offboardingApprovalRepository: Repository<OffboardingApproval>,
  ) {}

  @Cron(process.env.ACTION_INBOX_RECONCILIATION_CRON || '0 */15 * * * *')
  async reconcile(): Promise<void> {
    const { acquired } = await this.advisoryLockService.runWithLock(
      RECONCILIATION_LOCK_KEY,
      async () => {
        await Promise.allSettled([
          this.reconcileLeaveApprovals(),
          this.reconcileOnboardingApprovals(),
          this.reconcileOffboardingApprovals(),
        ]);
      },
    );

    if (!acquired) {
      this.logger.log(
        'Skipped action-inbox reconciliation: another worker holds the lock',
      );
    }
  }

  private async reconcileLeaveApprovals(): Promise<void> {
    const approvals = await this.leaveApprovalRepository.find({
      where: { status: LeaveApprovalStatusEnum.PENDING },
      relations: { leave_request: { employee: true } },
      take: 500,
    });

    for (const approval of approvals) {
      if (!approval.approver_company_user_id || !approval.leave_request) {
        continue;
      }

      await this.actionItemsService.upsertOpen({
        companyId: approval.leave_request.company_id,
        assigneeCompanyUserId: approval.approver_company_user_id,
        actionType: ActionItemTypeEnum.APPROVAL,
        sourceModule: 'leave',
        sourceEntityType: 'LEAVE_REQUEST',
        sourceEntityId: approval.leave_request_id,
        sourceKey: `leave:approval:${approval.leave_request_id}:${approval.approver_company_user_id}`,
        title: 'Leave approval required',
        actionUrl: `/leave/requests/${approval.leave_request_id}`,
      });
    }
  }

  private async reconcileOnboardingApprovals(): Promise<void> {
    const approvals = await this.onboardingApprovalRepository.find({
      where: { status: OnboardingApprovalStatusEnum.PENDING },
      relations: { onboarding_request: true },
      take: 500,
    });

    for (const approval of approvals) {
      if (!approval.approver_company_user_id || !approval.onboarding_request) {
        continue;
      }

      const sourceKey = `onboarding:approval:${approval.onboarding_request_id}:${approval.approver_company_user_id}`;
      if (
        approval.approval_level !==
        approval.onboarding_request.current_approval_level
      ) {
        await this.actionItemsService.completeBySource(
          approval.onboarding_request.company_id,
          sourceKey,
        );
        continue;
      }

      await this.actionItemsService.upsertOpen({
        companyId: approval.onboarding_request.company_id,
        assigneeCompanyUserId: approval.approver_company_user_id,
        actionType: ActionItemTypeEnum.APPROVAL,
        sourceModule: 'onboarding',
        sourceEntityType: 'ONBOARDING_REQUEST',
        sourceEntityId: approval.onboarding_request_id,
        sourceKey,
        title: 'Onboarding approval required',
        actionUrl: `/dashboard/employees/onboarding?tab=requests&request_id=${approval.onboarding_request_id}`,
      });
    }
  }

  private async reconcileOffboardingApprovals(): Promise<void> {
    const approvals = await this.offboardingApprovalRepository.find({
      where: { status: OffboardingApprovalStatusEnum.PENDING },
      relations: { offboarding_request: true },
      take: 500,
    });

    for (const approval of approvals) {
      if (!approval.approver_company_user_id || !approval.offboarding_request) {
        continue;
      }

      await this.actionItemsService.upsertOpen({
        companyId: approval.offboarding_request.company_id,
        assigneeCompanyUserId: approval.approver_company_user_id,
        actionType: ActionItemTypeEnum.APPROVAL,
        sourceModule: 'offboarding',
        sourceEntityType: 'OFFBOARDING_REQUEST',
        sourceEntityId: approval.offboarding_request_id,
        sourceKey: `offboarding:approval:${approval.offboarding_request_id}:${approval.approver_company_user_id}`,
        title: 'Offboarding approval required',
        actionUrl: `/offboarding/${approval.offboarding_request_id}/review`,
      });
    }
  }
}
