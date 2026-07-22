import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
    ]),
  ],
  controllers: [ScheduledReportingController],
  providers: [ScheduledReportingService],
  exports: [TypeOrmModule, ScheduledReportingService],
})
export class ScheduledReportingModule {}
