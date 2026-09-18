import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { Employee } from '../employees/entities/employee.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { WorkActivitiesModule } from '../work-activities/work-activities.module';
import { CompetencyTemplate } from './entities/competency-template.entity';
import { CompetencyTemplateItem } from './entities/competency-template-item.entity';
import { KpiAchievement } from './entities/kpi-achievement.entity';
import { KpiApplicabilityRule } from './entities/kpi-applicability-rule.entity';
import { KpiDefinition } from './entities/kpi-definition.entity';
import { KpiDefinitionVersion } from './entities/kpi-definition-version.entity';
import { EmployeePerformancePlan } from './entities/employee-performance-plan.entity';
import { EmployeePerformancePlanItem } from './entities/employee-performance-plan-item.entity';
import { PerformanceAppeal } from './entities/performance-appeal.entity';
import { PerformanceAuditLog } from './entities/performance-audit-log.entity';
import { PerformanceAggregate } from './entities/performance-aggregate.entity';
import { PerformanceCompetencyRating } from './entities/performance-competency-rating.entity';
import { PerformanceFinancialYear } from './entities/performance-financial-year.entity';
import { PerformanceImprovementMilestone } from './entities/performance-improvement-milestone.entity';
import { PerformanceImprovementPlan } from './entities/performance-improvement-plan.entity';
import { PerformancePeriodAssignment } from './entities/performance-period-assignment.entity';
import { PerformancePeriod } from './entities/performance-period.entity';
import { PerformanceRatingBand } from './entities/performance-rating-band.entity';
import { PerformanceRatingScale } from './entities/performance-rating-scale.entity';
import { PerformanceReviewModeration } from './entities/performance-review-moderation.entity';
import { PerformanceReview } from './entities/performance-review.entity';
import { KpiTemplate } from './entities/kpi-template.entity';
import { KpiTemplateItem } from './entities/kpi-template-item.entity';
import { PerformanceController } from './controllers/performance.controller';
import { PerformanceManagerController } from './controllers/performance-manager.controller';
import { PerformanceSelfServiceController } from './controllers/performance-self-service.controller';
import { KpiAchievementService } from './services/kpi-achievement.service';
import { KpiApplicabilityService } from './services/kpi-applicability.service';
import { KpiDataSourceRegistryService } from './services/kpi-data-source-registry.service';
import { KpiDefinitionService } from './services/kpi-definition.service';
import { PerformanceAggregationService } from './services/performance-aggregation.service';
import { PerformanceAuditService } from './services/performance-audit.service';
import { PerformanceCompetencyService } from './services/performance-competency.service';
import { PerformanceFinancialYearService } from './services/performance-financial-year.service';
import { PerformanceImprovementPlanService } from './services/performance-improvement-plan.service';
import { PerformanceInsightsService } from './services/performance-insights.service';
import { PerformancePeriodService } from './services/performance-period.service';
import { PerformancePlanService } from './services/performance-plan.service';
import { PerformanceRatingScaleService } from './services/performance-rating-scale.service';
import { PerformanceReviewService } from './services/performance-review.service';
import { PerformanceScoringService } from './services/performance-scoring.service';
import {
  EmployeeKpi,
  EmployeeKpiReviewHistory,
} from './entities/employee-kpi.entity';
import { EmployeeKpiService } from './services/employee-kpi.service';
import { EmployeeKpiProgressService } from './services/employee-kpi-progress.service';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Employee,
      AttendanceDailySummary,
      LeaveRequest,
      CompetencyTemplate,
      CompetencyTemplateItem,
      PerformanceFinancialYear,
      PerformancePeriod,
      PerformanceRatingScale,
      PerformanceRatingBand,
      KpiDefinition,
      KpiDefinitionVersion,
      KpiApplicabilityRule,
      KpiTemplate,
      KpiTemplateItem,
      EmployeePerformancePlan,
      EmployeePerformancePlanItem,
      PerformancePeriodAssignment,
      KpiAchievement,
      PerformanceCompetencyRating,
      PerformanceReview,
      PerformanceReviewModeration,
      PerformanceImprovementPlan,
      PerformanceImprovementMilestone,
      PerformanceAppeal,
      PerformanceAggregate,
      PerformanceAuditLog,
      EmployeeKpi,
      EmployeeKpiReviewHistory,
    ]),
    HrSharedModule,
    WorkActivitiesModule,
    NotificationsModule,
  ],
  controllers: [
    PerformanceController,
    PerformanceSelfServiceController,
    PerformanceManagerController,
  ],
  providers: [
    PerformanceAuditService,
    PerformanceScoringService,
    PerformanceFinancialYearService,
    PerformancePeriodService,
    PerformanceRatingScaleService,
    PerformanceCompetencyService,
    KpiDefinitionService,
    KpiApplicabilityService,
    PerformancePlanService,
    KpiAchievementService,
    KpiDataSourceRegistryService,
    PerformanceReviewService,
    PerformanceImprovementPlanService,
    PerformanceAggregationService,
    PerformanceInsightsService,
    EmployeeKpiProgressService,
    EmployeeKpiService,
  ],
  exports: [
    PerformanceInsightsService,
    PerformanceReviewService,
    PerformanceAggregationService,
    KpiDataSourceRegistryService,
    EmployeeKpiService,
    EmployeeKpiProgressService,
  ],
})
export class PerformanceModule {}
