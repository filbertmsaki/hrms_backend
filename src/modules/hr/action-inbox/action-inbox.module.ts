import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionItem } from './entities/action-item.entity';
import { ActionItemsService } from './action-items.service';
import { ActionItemReconciliationService } from './action-item-reconciliation.service';
import { PostgresAdvisoryLockService } from '../../../common/database/postgres-advisory-lock.service';
import { LeaveRequestApproval } from '../leave/entities/leave-request-approval.entity';
import { OnboardingApproval } from '../onboarding/entities/onboarding-approval.entity';
import { OffboardingApproval } from '../offboarding/entities/offboarding-approval.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ActionItem,
      LeaveRequestApproval,
      OnboardingApproval,
      OffboardingApproval,
    ]),
  ],
  providers: [
    ActionItemsService,
    ActionItemReconciliationService,
    PostgresAdvisoryLockService,
  ],
  exports: [ActionItemsService, TypeOrmModule],
})
export class ActionInboxModule {}
