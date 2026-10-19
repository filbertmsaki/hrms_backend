import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../../mail/mail.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ActionItem } from '../action-inbox/entities/action-item.entity';
import { ActionInboxModule } from '../action-inbox/action-inbox.module';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { HikvisionSyncLog } from '../../access-control/hikvision-sync-logs/entity/hikvision-sync-log.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { EmployeeFinancePayrollInstruction } from '../employee-finance/entities/employee-finance-account.entities';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeKpi } from '../performance/entities/employee-kpi.entity';
import { PerformanceReview } from '../performance/entities/performance-review.entity';
import { PayrollRun, Payslip } from '../payroll/entities/payroll-run.entities';
import { DailyActivityReport } from '../work-activities/entities/daily-activity.entities';
import { FieldVisit } from '../work-activities/entities/field-visit.entities';
import { HrAlertSchedulerService } from './hr-alert-scheduler.service';
import { AttendanceSyncFailureAlertService } from './attendance-sync-failure-alert.service';
import { HrInAppNotificationListener } from './hr-in-app-notification.listener';
import { HrNotificationListener } from './hr-notification.listener';
import { AttendanceSyncAlertsController } from './attendance-sync-alerts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceDailySummary,
      HikvisionSyncLog,
      CompanyUser,
      DailyActivityReport,
      FieldVisit,
      EmployeeKpi,
      PerformanceReview,
      PayrollRun,
      Payslip,
      EmployeeFinancePayrollInstruction,
      ActionItem,
      Employee,
    ]),
    MailModule,
    NotificationsModule,
    ActionInboxModule,
  ],
  controllers: [AttendanceSyncAlertsController],
  providers: [
    HrNotificationListener,
    HrInAppNotificationListener,
    HrAlertSchedulerService,
    AttendanceSyncFailureAlertService,
  ],
})
export class HrNotificationModule {}
