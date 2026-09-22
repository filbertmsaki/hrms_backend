import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request as ExpressRequest, Response } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  ApiActionOperation,
  ApiListOperation,
} from '../../../../docs/swagger-decorators';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import { AttendanceProcessingExceptionsService } from './attendance-processing-exceptions.service';
import { AttendanceProcessingService } from './attendance-processing.service';
import { AttendanceRecalculationService } from './attendance-recalculation.service';
import { AttendanceReportService } from './reports/attendance-report.service';
import { ProcessAttendanceRangeDto } from './dtos/process-attendance-range.dto';
import { ProcessPendingRecalculationJobsDto } from './dtos/process-pending-recalculation-jobs.dto';
import { DownloadAttendanceReportDto } from './dtos/download-attendance-report.dto';
import { QueryAttendanceExceptionsDto } from './dtos/query-attendance-exceptions.dto';
import { QueryAttendanceDailySummariesDto } from './dtos/query-attendance-daily-summaries.dto';
import { QueryAttendanceProcessingJobsDto } from './dtos/query-attendance-processing-jobs.dto';
import { QueryUnmatchedAttendanceLogsDto } from './dtos/query-unmatched-attendance-logs.dto';
import {
  AttendanceRefreshExecutionEnum,
  AttendanceRefreshExecutionModeEnum,
  AttendanceRefreshModeEnum,
  AttendanceRefreshProcessingSourceEnum,
  RefreshAttendanceDailySummariesDto,
} from './dtos/refresh-attendance-daily-summaries.dto';
import { UpdateAttendanceExceptionStatusDto } from './dtos/update-attendance-exception-status.dto';
import { UpsertAttendanceDailySummaryAdjustmentDto } from './dtos/upsert-attendance-daily-summary-adjustment.dto';

@ApiTags('Attendance Processing')
@ApiBearerAuth('access-token')
@Controller('attendance')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceProcessingController {
  constructor(
    private readonly processingService: AttendanceProcessingService,
    private readonly dailySummaryService: AttendanceDailySummaryService,
    private readonly exceptionService: AttendanceProcessingExceptionsService,
    private readonly recalculationService: AttendanceRecalculationService,
    private readonly attendanceReportService: AttendanceReportService,
  ) {}

  @Post('processing/run-range')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_processing:execute')
  @ApiActionOperation(
    'Process Attendance Range',
    'Transform raw logs into processed events and daily summaries',
  )
  processRange(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: ProcessAttendanceRangeDto,
  ) {
    return this.processingService.processRange(req.user.companyId!, dto);
  }

  @Post('processing/jobs/run-pending')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_recalculation:execute')
  @ApiActionOperation(
    'Run Pending Recalculation Jobs',
    'Execute queued attendance recalculation jobs',
  )
  runPendingJobs(@Body() dto: ProcessPendingRecalculationJobsDto) {
    return this.recalculationService.processPendingJobs(dto.limit ?? 20);
  }

  @Get('processing/jobs')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_processing:read')
  @ApiListOperation(
    'Attendance Processing Jobs',
    'List attendance recalculation jobs',
  )
  getJobs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryAttendanceProcessingJobsDto,
  ) {
    return this.recalculationService.findJobs(req.user.companyId!, query);
  }

  @Post('daily-summaries/refresh')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_recalculation:execute')
  @ApiActionOperation(
    'Refresh Attendance Daily Summaries',
    'Refresh attendance for a date range by either rebuilding summaries only or reprocessing from raw logs.',
  )
  refreshDailySummaries(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: RefreshAttendanceDailySummariesDto,
  ) {
    return this.recalculationService.refreshSummaries(
      req.user.companyId!,
      req.user.companyMembershipId ?? null,
      this.normalizeRefreshDailySummariesDto(dto),
    );
  }

  @Get('daily-summaries')
  @UseGuards(PermissionsGuard)
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Permissions('attendance_summaries:read')
  @ApiListOperation(
    'Attendance Daily Summaries',
    'List processed daily attendance summaries',
  )
  getDailySummaries(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryAttendanceDailySummariesDto,
  ) {
    return this.dailySummaryService.findDailySummaries(
      req.user.companyId!,
      query,
      req.user,
    );
  }

  @Get('reports/download')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_summaries:read')
  @ApiActionOperation(
    'Download Attendance Report',
    'Download filtered attendance summaries as XLSX, CSV, or PDF.',
  )
  async downloadReport(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: DownloadAttendanceReportDto,
    @Res() res: Response,
  ) {
    await this.attendanceReportService.downloadReport(res, req.user, query);
  }

  @Get('daily-summaries/:employeeId/:date')
  @UseGuards(PermissionsGuard)
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Permissions('attendance_summaries:read')
  @ApiActionOperation(
    'Attendance Daily Summary',
    'Read one employee-day attendance summary without recalculating it.',
  )
  getOneDaySummary(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('date') date: string,
  ) {
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
  @ApiListOperation(
    'Unmatched Attendance Logs',
    'List processed events with unmatched employees',
  )
  getUnmatchedLogs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryUnmatchedAttendanceLogsDto,
  ) {
    return this.dailySummaryService.findUnmatchedLogs(
      req.user.companyId!,
      query,
    );
  }

  @Get('processing/exceptions')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_processing:read')
  @ApiListOperation(
    'Attendance Exceptions',
    'List attendance processing exceptions',
  )
  getExceptions(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryAttendanceExceptionsDto,
  ) {
    return this.exceptionService.findAll(req.user.companyId!, query);
  }

  @Patch('processing/exceptions/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_processing:execute')
  @ApiActionOperation(
    'Update Attendance Exception',
    'Resolve or ignore an attendance processing exception',
  )
  updateException(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceExceptionStatusDto,
  ) {
    return this.exceptionService.updateStatus(
      req.user.companyId!,
      id,
      dto,
      req.user.companyMembershipId ?? null,
    );
  }

  @Put('daily-summaries/:employeeId/:date/adjustment')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_processing:execute')
  @ApiActionOperation(
    'Adjust Attendance Daily Summary',
    'Apply a manual adjustment while keeping raw punches unchanged',
  )
  upsertAdjustment(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('date') date: string,
    @Body() dto: UpsertAttendanceDailySummaryAdjustmentDto,
  ) {
    return this.dailySummaryService.upsertAdjustment(
      req.user.companyId!,
      employeeId,
      date,
      dto,
      req.user.companyMembershipId ?? null,
    );
  }

  @Delete('daily-summaries/:employeeId/:date/adjustment')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_processing:execute')
  @ApiActionOperation(
    'Clear Attendance Daily Summary Adjustment',
    'Remove the active manual adjustment and recompute from raw punches',
  )
  clearAdjustment(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('date') date: string,
  ) {
    return this.dailySummaryService.clearAdjustment(
      req.user.companyId!,
      employeeId,
      date,
    );
  }

  private normalizeRefreshDailySummariesDto(
    dto: RefreshAttendanceDailySummariesDto,
  ): RefreshAttendanceDailySummariesDto {
    return {
      ...dto,
      start_date: dto.start_date ?? dto.startDate,
      end_date: dto.end_date ?? dto.endDate,
      processing_source:
        dto.processing_source ??
        dto.processingSource ??
        (dto.mode === AttendanceRefreshModeEnum.FROM_RAW_LOGS
          ? AttendanceRefreshProcessingSourceEnum.DATABASE_ONLY
          : undefined),
      execution_mode:
        dto.execution_mode ??
        dto.executionMode ??
        (dto.execution === AttendanceRefreshExecutionEnum.SYNC
          ? AttendanceRefreshExecutionModeEnum.IMMEDIATE
          : dto.execution === AttendanceRefreshExecutionEnum.ASYNC
            ? AttendanceRefreshExecutionModeEnum.BACKGROUND
            : undefined),
      device_id: dto.device_id ?? this.toPositiveInteger(dto.deviceId),
      employee_id: dto.employee_id ?? this.toPositiveInteger(dto.employeeId),
    } as RefreshAttendanceDailySummariesDto;
  }

  private toPositiveInteger(value: number | string | undefined) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }
}
