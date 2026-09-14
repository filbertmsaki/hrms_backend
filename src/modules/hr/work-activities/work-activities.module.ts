import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionInboxModule } from '../action-inbox/action-inbox.module';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceBusinessTrip } from '../attendance/processing/entities/attendance-business-trip.entity';
import { Employee } from '../employees/entities/employee.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import {
  ActivityCategory,
  ActivityPolicy,
  FieldParty,
} from './entities/activity-config.entities';
import {
  FieldLocationAccessLog,
  WorkActivityAuditLog,
  WorkActivityException,
  WorkActivityPeriodSummary,
} from './entities/analytics.entities';
import {
  DailyActivityEntry,
  DailyActivityEvidence,
  DailyActivityReport,
  DailyActivityComment,
} from './entities/daily-activity.entities';
import {
  FieldFollowUp,
  FieldMobileSyncRequest,
  FieldOpportunity,
  FieldVisit,
  FieldVisitEvidence,
  FieldVisitExpense,
  FieldVisitLocationEvent,
  FieldVisitPlan,
  FieldVisitPlanItem,
} from './entities/field-visit.entities';
import { ManagerActivitiesController } from './controllers/manager-activities.controller';
import { ManagerFieldVisitsController } from './controllers/manager-field-visits.controller';
import { MyDailyActivitiesController } from './controllers/my-daily-activities.controller';
import { MyFieldVisitsCompatController } from './controllers/my-field-visits-compat.controller';
import { MyFieldVisitsController } from './controllers/my-field-visits.controller';
import { WorkActivitiesAdminController } from './controllers/work-activities-admin.controller';
import { ActivityPolicyService } from './services/activity-policy.service';
import { DailyActivityService } from './services/daily-activity.service';
import { FieldLocationEnrichmentService } from './services/field-location-enrichment.service';
import { FieldLocationRetentionService } from './services/field-location-retention.service';
import { FieldMobileSyncService } from './services/field-mobile-sync.service';
import { FieldPartyService } from './services/field-party.service';
import { FieldVisitService } from './services/field-visit.service';
import { WorkActivityAuditService } from './services/work-activity-audit.service';
import { WorkActivityExceptionService } from './services/work-activity-exception.service';
import { WorkActivityInsightsService } from './services/work-activity-insights.service';
import { WorkActivityKpiProviderService } from './services/work-activity-kpi-provider.service';
import { WorkActivityReminderService } from './services/work-activity-reminder.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Employee,
      LeaveRequest,
      AttendanceDailySummary,
      AttendanceBusinessTrip,
      ActivityCategory,
      ActivityPolicy,
      FieldParty,
      DailyActivityReport,
      DailyActivityEntry,
      DailyActivityEvidence,
      DailyActivityComment,
      FieldVisitPlan,
      FieldVisitPlanItem,
      FieldVisit,
      FieldVisitLocationEvent,
      FieldVisitEvidence,
      FieldOpportunity,
      FieldFollowUp,
      FieldVisitExpense,
      FieldMobileSyncRequest,
      WorkActivityPeriodSummary,
      FieldLocationAccessLog,
      WorkActivityAuditLog,
      WorkActivityException,
    ]),
    HrSharedModule,
    ActionInboxModule,
    NotificationsModule,
  ],
  controllers: [
    MyDailyActivitiesController,
    MyFieldVisitsController,
    MyFieldVisitsCompatController,
    ManagerActivitiesController,
    ManagerFieldVisitsController,
    WorkActivitiesAdminController,
  ],
  providers: [
    ActivityPolicyService,
    DailyActivityService,
    FieldPartyService,
    FieldVisitService,
    FieldMobileSyncService,
    FieldLocationRetentionService,
    FieldLocationEnrichmentService,
    WorkActivityAuditService,
    WorkActivityExceptionService,
    WorkActivityInsightsService,
    WorkActivityKpiProviderService,
    WorkActivityReminderService,
  ],
  exports: [WorkActivityInsightsService, WorkActivityKpiProviderService],
})
export class WorkActivitiesModule {}
