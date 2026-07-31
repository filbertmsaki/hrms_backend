import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { Department } from '../hr/departments/entities/department.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
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
import { ReportRegistryService } from './services/report-registry.service';
import { ReportSmtpService } from './services/report-smtp.service';

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
    ]),
  ],
  controllers: [ScheduledReportingController],
  providers: [
    ScheduledReportingService,
    ReportRegistryService,
    ReportSmtpService,
  ],
  exports: [TypeOrmModule, ScheduledReportingService],
})
export class ScheduledReportingModule {}
