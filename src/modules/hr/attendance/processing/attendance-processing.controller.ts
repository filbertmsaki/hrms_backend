import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { ApiActionOperation, ApiListOperation } from '../../../../docs/swagger-decorators';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import { AttendanceProcessingService } from './attendance-processing.service';
import { AttendanceRecalculationService } from './attendance-recalculation.service';
import { ProcessAttendanceRangeDto } from './dtos/process-attendance-range.dto';
import { ProcessPendingRecalculationJobsDto } from './dtos/process-pending-recalculation-jobs.dto';
import { QueryAttendanceDailySummariesDto } from './dtos/query-attendance-daily-summaries.dto';
import { QueryAttendanceProcessingJobsDto } from './dtos/query-attendance-processing-jobs.dto';
import { QueryUnmatchedAttendanceLogsDto } from './dtos/query-unmatched-attendance-logs.dto';
import { RecalculateAttendanceDto } from './dtos/recalculate-attendance.dto';

@ApiTags('Attendance Processing')
@ApiBearerAuth('access-token')
@Controller('attendance')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceProcessingController {
  constructor(
    private readonly processingService: AttendanceProcessingService,
    private readonly dailySummaryService: AttendanceDailySummaryService,
    private readonly recalculationService: AttendanceRecalculationService,
  ) {}

  @Post('processing/run-range')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_processing:execute')
  @ApiActionOperation('Process Attendance Range', 'Transform raw logs into processed events and daily summaries')
  processRange(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: ProcessAttendanceRangeDto,
  ) {
    return this.processingService.processRange(req.user.companyId!, dto);
  }

  @Post('processing/recalculate')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_recalculation:execute')
  @ApiActionOperation('Queue Attendance Recalculation', 'Queue and optionally execute attendance recalculation')
  recalculate(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: RecalculateAttendanceDto,
  ) {
    return this.recalculationService.queueRecalculation(
      req.user.companyId!,
      req.user.companyMembershipId ?? null,
      dto,
    );
  }

  @Post('processing/jobs/run-pending')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_recalculation:execute')
  @ApiActionOperation('Run Pending Recalculation Jobs', 'Execute queued attendance recalculation jobs')
  runPendingJobs(@Body() dto: ProcessPendingRecalculationJobsDto) {
    return this.recalculationService.processPendingJobs(dto.limit ?? 20);
  }

  @Get('processing/jobs')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_processing:read')
  @ApiListOperation('Attendance Processing Jobs', 'List attendance recalculation jobs')
  getJobs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryAttendanceProcessingJobsDto,
  ) {
    return this.recalculationService.findJobs(req.user.companyId!, query);
  }

  @Get('daily-summaries')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_summaries:read')
  @ApiListOperation('Attendance Daily Summaries', 'List processed daily attendance summaries')
  getDailySummaries(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryAttendanceDailySummariesDto,
  ) {
    return this.dailySummaryService.findDailySummaries(req.user.companyId!, query);
  }

  @Get('daily-summaries/:employeeId/:date')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_summaries:read')
  @ApiActionOperation('Attendance Daily Summary', 'Recompute one employee-day attendance summary and return it')
  async recomputeOneDay(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('date') date: string,
  ) {
    await this.dailySummaryService.recomputeForEmployeeDate(req.user.companyId!, employeeId, date);
    return this.dailySummaryService.findDailySummaries(req.user.companyId!, {
      employee_id: employeeId,
      from_date: date,
      to_date: date,
      page: 1,
      limit: 1,
    });
  }

  @Get('processing/unmatched-logs')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_processing:read')
  @ApiListOperation('Unmatched Attendance Logs', 'List processed events with unmatched employees')
  getUnmatchedLogs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryUnmatchedAttendanceLogsDto,
  ) {
    return this.dailySummaryService.findUnmatchedLogs(req.user.companyId!, query);
  }
}
