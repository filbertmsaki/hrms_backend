import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../../mail/mail.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ActionItem } from '../action-inbox/entities/action-item.entity';
import { ActionInboxModule } from '../action-inbox/action-inbox.module';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { EmployeeFinancePayrollInstruction } from '../employee-finance/entities/employee-finance-account.entities';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeKpi } from '../performance/entities/employee-kpi.entity';
import { PerformanceReview } from '../performance/entities/performance-review.entity';
import { PayrollRun, Payslip } from '../payroll/entities/payroll-run.entities';
import { DailyActivityReport } from '../work-activities/entities/daily-activity.entities';
import { FieldVisit } from '../work-activities/entities/field-visit.entities';
import { HrAlertSchedulerService } from './hr-alert-scheduler.service';
import { HrInAppNotificationListener } from './hr-in-app-notification.listener';
import { HrNotificationListener } from './hr-notification.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceDailySummary,
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
  providers: [
    HrNotificationListener,
    HrInAppNotificationListener,
    HrAlertSchedulerService,
  ],
})
export class HrNotificationModule {}
