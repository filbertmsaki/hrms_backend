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
import {
  ApiActionOperation,
  ApiListOperation,
} from '../../../../docs/swagger-decorators';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import { AttendanceProcessingExceptionsService } from './attendance-processing-exceptions.service';
import { AttendanceProcessingService } from './attendance-processing.service';
import { AttendanceRecalculationService } from './attendance-recalculation.service';
import { ProcessAttendanceRangeDto } from './dtos/process-attendance-range.dto';
import { ProcessPendingRecalculationJobsDto } from './dtos/process-pending-recalculation-jobs.dto';
import { QueryAttendanceExceptionsDto } from './dtos/query-attendance-exceptions.dto';
import { QueryAttendanceDailySummariesDto } from './dtos/query-attendance-daily-summaries.dto';
import { QueryAttendanceProcessingJobsDto } from './dtos/query-attendance-processing-jobs.dto';
import { QueryUnmatchedAttendanceLogsDto } from './dtos/query-unmatched-attendance-logs.dto';
import { RebuildAttendanceSummariesDto } from './dtos/rebuild-attendance-summaries.dto';
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

  @Post('daily-summaries/rebuild')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_recalculation:execute')
  @ApiActionOperation(
    'Rebuild Attendance Summaries',
    'Rebuild daily attendance summaries for a date range. ' +
      'Set async=true to queue a background job and return immediately; ' +
      'omit or set async=false to run synchronously and return the result.',
  )
  rebuildSummaries(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: RebuildAttendanceSummariesDto,
  ) {
    if (dto.async) {
      return this.recalculationService.queueRecalculation(
        req.user.companyId!,
        req.user.companyMembershipId ?? null,
        {
          start_date: dto.start_date,
          end_date: dto.end_date,
          employee_id: dto.employee_id,
          reason: dto.reason,
          process_immediately: false,
        },
      );
    }

    return this.dailySummaryService.rebuildSummariesForRange({
      companyId: req.user.companyId!,
      startDate: dto.start_date,
      endDate: dto.end_date,
      employeeId: dto.employee_id,
      forceRebuild: dto.force_rebuild ?? true,
    });
  }

  @Get('daily-summaries')
  @UseGuards(PermissionsGuard)
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
    );
  }

  @Get('daily-summaries/:employeeId/:date')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_summaries:read')
  @ApiActionOperation(
    'Attendance Daily Summary',
    'Recompute one employee-day attendance summary and return it',
  )
  async recomputeOneDay(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('date') date: string,
  ) {
    await this.dailySummaryService.recomputeForEmployeeDate(
      req.user.companyId!,
      employeeId,
      date,
    );
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
}
