import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostgresAdvisoryLockService } from '../../common/database/postgres-advisory-lock.service';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { FilesModule } from '../files/files.module';
import { AttendanceDailySummary } from '../hr/attendance/processing/entities/attendance-daily-summary.entity';
import { Department } from '../hr/departments/entities/department.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { PerformanceAggregate } from '../hr/performance/entities/performance-aggregate.entity';
import { PerformanceReview } from '../hr/performance/entities/performance-review.entity';
import { Role } from '../roles/entities/role.entity';
import { ReportDefinition } from './entities/report-definition.entity';
import { ReportExecution } from './entities/report-execution.entity';
import { ReportExecutionAttempt } from './entities/report-execution-attempt.entity';
import { ReportExecutionRecipient } from './entities/report-execution-recipient.entity';
import { ReportSchedule } from './entities/report-schedule.entity';
import { ReportScheduleWeekday } from './entities/report-schedule-weekday.entity';
import { ReportSmtpConfiguration } from './entities/report-smtp-configuration.entity';
import { ReportTemplate } from './entities/report-template.entity';
import { ReportTemplateRecipient } from './entities/report-template-recipient.entity';
import { ScheduledReportingController } from './scheduled-reporting.controller';
import { ScheduledReportingService } from './scheduled-reporting.service';
import { ReportExecutionService } from './services/report-execution.service';
import { ReportExecutionWorkerService } from './services/report-execution-worker.service';
import { ReportRegistryService } from './services/report-registry.service';
import { ReportScheduleDispatcherService } from './services/report-schedule-dispatcher.service';
import { ReportSmtpService } from './services/report-smtp.service';
import { AttendanceSummaryReportRunner } from './services/runners/attendance-summary-report-runner.service';
import { EmployeeMasterReportRunner } from './services/runners/employee-master-report-runner.service';
import { PerformanceSummaryReportRunner } from './services/runners/performance-summary-report-runner.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReportSmtpConfiguration,
      ReportDefinition,
      ReportTemplate,
      ReportTemplateRecipient,
      ReportSchedule,
      ReportScheduleWeekday,
      ReportExecution,
      ReportExecutionRecipient,
      ReportExecutionAttempt,
      CompanyUser,
      Employee,
      Department,
      Role,
      AttendanceDailySummary,
      PerformanceReview,
      PerformanceAggregate,
    ]),
    FilesModule,
  ],
  controllers: [ScheduledReportingController],
  providers: [
    ScheduledReportingService,
    ReportRegistryService,
    ReportSmtpService,
    ReportExecutionService,
    ReportExecutionWorkerService,
    ReportScheduleDispatcherService,
    AttendanceSummaryReportRunner,
    EmployeeMasterReportRunner,
    PerformanceSummaryReportRunner,
    PostgresAdvisoryLockService,
  ],
  exports: [TypeOrmModule, ScheduledReportingService],
})
export class ScheduledReportingModule {}
