import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { ActionInboxModule } from '../action-inbox/action-inbox.module';
import { FilesModule } from '../../files/files.module';
import { OffboardingModule } from '../offboarding/offboarding.module';
import { Document } from '../documents/entities/document.entity';
import { PostgresAdvisoryLockService } from '../../../common/database/postgres-advisory-lock.service';
import { ProbationPolicy } from './entities/probation-policy.entity';
import { ProbationPolicyCriterion } from './entities/probation-policy-criterion.entity';
import { ProbationNumberSequence } from './entities/probation-number-sequence.entity';
import { ProbationCase } from './entities/probation-case.entity';
import { ProbationReviewCycle } from './entities/probation-review-cycle.entity';
import { ProbationReviewRating } from './entities/probation-review-rating.entity';
import { ProbationObjective } from './entities/probation-objective.entity';
import { ProbationExtension } from './entities/probation-extension.entity';
import { ProbationAuditLog } from './entities/probation-audit-log.entity';
import { ProbationController } from './probation.controller';
import { ProbationService } from './probation.service';
import { ProbationPolicyResolverService } from './services/probation-policy-resolver.service';
import { ProbationAuditService } from './services/probation-audit.service';
import { ProbationLetterService } from './services/probation-letter.service';
import { ProbationReminderService } from './services/probation-reminder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProbationPolicy,
      ProbationPolicyCriterion,
      ProbationNumberSequence,
      ProbationCase,
      ProbationReviewCycle,
      ProbationReviewRating,
      ProbationObjective,
      ProbationExtension,
      ProbationAuditLog,
      Employee,
      Document,
    ]),
    HrSharedModule,
    ActionInboxModule,
    FilesModule,
    OffboardingModule,
  ],
  controllers: [ProbationController],
  providers: [
    ProbationService,
    ProbationPolicyResolverService,
    ProbationAuditService,
    ProbationLetterService,
    ProbationReminderService,
    PostgresAdvisoryLockService,
  ],
  exports: [ProbationService, TypeOrmModule],
})
export class ProbationModule {}
