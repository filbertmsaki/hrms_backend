import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceHoliday } from '../holidays/entities/holiday.entity';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { EmployeeDeviceAssignment } from '../../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveRequest } from '../../leave/entities/leave-request.entity';
import { LeaveType } from '../../leave/entities/leave-type.entity';
import { LeaveModule } from '../../leave/leave.module';
import { HrSharedModule } from '../../shared/hr-shared.module';
import { ShiftAssignment } from '../shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftBreak } from '../shift/shift-breaks/entities/shift-break.entity';
import { ShiftRotationGroup } from '../shift/shift-rotation-groups/entities/shift-rotation-group.entity';
import { ShiftRotationRule } from '../shift/shift-rotation-rules/entities/shift-rotation-rule.entity';
import { ShiftSchedule } from '../shift/shift-schedules/entities/shift-schedule.entity';
import { Shift } from '../shift/shifts/entities/shift.entity';
import { AttendancePolicy } from '../policies/entities/attendance-policy.entity';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { TimetableHolidayRule } from '../timetable/timetable-holiday-rules/entities/timetable-holiday-rule.entity';
import { TimetableRotation } from '../timetable/timetable-rotations/entities/timetable-rotation.entity';
import { TimetableRotationRule } from '../timetable/timetable-rotation-rules/entities/timetable-rotation-rule.entity';
import { Timetable } from '../timetable/timetables/entities/timetable.entity';
import { TimetableDay } from '../timetable/timetable-days/entities/timetable-day.entity';
import { AttendanceBusinessTrip } from './entities/attendance-business-trip.entity';
import { AttendanceDailySummaryAdjustment } from './entities/attendance-daily-summary-adjustment.entity';
import { AttendanceDailySummary } from './entities/attendance-daily-summary.entity';
import { AttendanceProcessingException } from './entities/attendance-processing-exception.entity';
import { AttendanceProcessedEvent } from './entities/attendance-processed-event.entity';
import { AttendanceRecalculationJob } from './entities/attendance-recalculation-job.entity';
import { EmployeeDeviceIdentity } from './entities/employee-device-identity.entity';
import { AttendanceMobilePunch } from '../mobile-punches/entities/attendance-mobile-punch.entity';
import { AttendanceBusinessTripsController } from './attendance-business-trips.controller';
import { AttendanceBusinessTripsService } from './attendance-business-trips.service';
import { AttendanceEventDirectionResolverService } from './attendance-event-direction-resolver.service';
import { AttendanceEventIngestionService } from './attendance-event-ingestion.service';
import { AttendanceProcessingController } from './attendance-processing.controller';
import { AttendanceEmployeeResolverService } from './attendance-employee-resolver.service';
import { AttendanceProcessingExceptionsService } from './attendance-processing-exceptions.service';
import { AttendanceScheduleResolverService } from './attendance-schedule-resolver.service';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import { AttendanceProcessingService } from './attendance-processing.service';
import { AttendanceRecalculationService } from './attendance-recalculation.service';
import { AttendanceProcessingCronService } from './attendance-processing-cron.service';
import { TimetableScheduleGenerationService } from './timetable-schedule-generation.service';
import { AttendanceCompanyConfigService } from '../shared/attendance-company-config.service';
import { AttendanceReportCsvService } from './reports/attendance-report-csv.service';
import { AttendanceReportPdfService } from './reports/attendance-report-pdf.service';
import { AttendanceReportPreflightService } from './reports/attendance-report-preflight.service';
import { AttendanceReportService } from './reports/attendance-report.service';
import { AttendanceReportXlsxService } from './reports/attendance-report-xlsx.service';
import { HikvisionModule } from '../../../hikvision/hikvision.module';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyUser,
      Employee,
      AttendanceDevice,
      AttendanceHoliday,
      AttendancePolicy,
      LeaveRequest,
      LeaveType,
      HikvisionAttendanceLog,
      Shift,
      ShiftAssignment,
      ShiftBreak,
      ShiftSchedule,
      ShiftRotationGroup,
      ShiftRotationRule,
      Timetable,
      EmployeeTimetable,
      TimetableDay,
      TimetableHolidayRule,
      TimetableRotation,
      TimetableRotationRule,
      EmployeeDeviceAssignment,
      EmployeeDeviceIdentity,
      AttendanceMobilePunch,
      AttendanceProcessedEvent,
      AttendanceProcessingException,
      AttendanceDailySummary,
      AttendanceDailySummaryAdjustment,
      AttendanceRecalculationJob,
      AttendanceBusinessTrip,
    ]),
    HrSharedModule,
    forwardRef(() => LeaveModule),
    forwardRef(() => HikvisionModule),
  ],
  controllers: [
    AttendanceProcessingController,
    AttendanceBusinessTripsController,
  ],
  providers: [
    AttendanceBusinessTripsService,
    AttendanceEventDirectionResolverService,
    AttendanceEventIngestionService,
    AttendanceEmployeeResolverService,
    AttendanceProcessingExceptionsService,
    AttendanceScheduleResolverService,
    AttendanceDailySummaryService,
    TimetableScheduleGenerationService,
    AttendanceProcessingService,
    AttendanceRecalculationService,
    AttendanceProcessingCronService,
    AttendanceCompanyConfigService,
    AttendanceReportCsvService,
    AttendanceReportPdfService,
    AttendanceReportService,
    AttendanceReportXlsxService,
    AttendanceReportPreflightService,
    PostgresAdvisoryLockService,
  ],
  exports: [
    AttendanceBusinessTripsService,
    AttendanceEventDirectionResolverService,
    AttendanceEventIngestionService,
    AttendanceProcessingExceptionsService,
    AttendanceScheduleResolverService,
    AttendanceProcessingService,
    AttendanceDailySummaryService,
    AttendanceRecalculationService,
    AttendanceReportPreflightService,
    TypeOrmModule,
  ],
})
export class AttendanceProcessingModule {}
