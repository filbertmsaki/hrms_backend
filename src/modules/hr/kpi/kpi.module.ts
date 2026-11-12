import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { FilesModule } from '../../files/files.module';
import { ActionInboxModule } from '../action-inbox/action-inbox.module';
import { ActionItem } from '../action-inbox/entities/action-item.entity';
import { KpiController } from './kpi.controller';
import {
  KpiAssignment,
  KpiDefinition,
  KpiDefinitionVersion,
  KpiPeriod,
  KpiTargetRevision,
  KpiTemplate,
} from './kpi.entities';
import { KpiRolesGuard } from './kpi-roles.guard';
import { KpiService } from './kpi.service';
import { KpiPeriodNotificationService } from './kpi-period-notification.service';
import { ScorecardController } from './scorecard.controller';
import { ScorecardService } from './scorecard.service';
import {
  Scorecard,
  ScorecardTemplate,
  ScorecardVersion,
  ScoringPolicy,
  ScoringPolicyVersion,
} from './scorecard.entities';
import { AchievementController } from './achievement.controller';
import { AchievementService } from './achievement.service';
import {
  KpiAchievement,
  KpiAchievementEvent,
  KpiAchievementEvidence,
  KpiAchievementRevision,
  KpiEvidenceRule,
} from './achievement.entities';
import {
  EvaluationCycle,
  EvaluationDeadlineException,
  EvaluationEvent,
  EvaluationRevision,
  EvaluationTemplate,
  EvaluationTemplateVersion,
  PerformanceEvaluation,
} from './evaluation.entities';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';
import { KpiAnalyticsController } from './kpi-analytics.controller';
import { KpiAnalyticsService } from './kpi-analytics.service';
import { KpiReportController } from './kpi-report.controller';
import { KpiReportService } from './kpi-report.service';
import { KpiWorkflowController } from './kpi-workflow.controller';
import { KpiWorkflowService } from './kpi-workflow.service';
import { CompanyUser } from '../../companies/entities/company-user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanyUser,
      ActionItem,
      Branch,
      Department,
      Employee,
      KpiDefinition,
      KpiDefinitionVersion,
      KpiTemplate,
      KpiPeriod,
      KpiAssignment,
      KpiTargetRevision,
      Scorecard,
      ScorecardVersion,
      ScoringPolicy,
      ScoringPolicyVersion,
      ScorecardTemplate,
      KpiAchievement,
      KpiAchievementRevision,
      KpiAchievementEvidence,
      KpiAchievementEvent,
      KpiEvidenceRule,
      EvaluationCycle,
      EvaluationDeadlineException,
      EvaluationEvent,
      EvaluationRevision,
      EvaluationTemplate,
      EvaluationTemplateVersion,
      PerformanceEvaluation,
    ]),
    HrSharedModule,
    FilesModule,
    ActionInboxModule,
  ],
  controllers: [
    KpiController,
    ScorecardController,
    AchievementController,
    EvaluationController,
    KpiAnalyticsController,
    KpiReportController,
    KpiWorkflowController,
  ],
  providers: [
    KpiService,
    KpiPeriodNotificationService,
    KpiRolesGuard,
    ScorecardService,
    AchievementService,
    EvaluationService,
    KpiAnalyticsService,
    KpiReportService,
    KpiWorkflowService,
  ],
})
export class KpiModule {}
