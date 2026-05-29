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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ApiActionOperation, ApiListOperation } from '../../docs/swagger-decorators';
import { PullAttendancePageDto } from './dto/pull-attendance-page.dto';
import { QueryHikvisionAttendanceLogsDto } from './dto/query-hikvision-attendance-logs.dto';
import { SyncAttendanceByDateDto } from './dto/sync-attendance-by-date.dto';
import { SyncAttendanceByEmployeeDto } from './dto/sync-attendance-by-employee.dto';
import { SyncAttendanceByRangeDto } from './dto/sync-attendance-by-range.dto';
import { HikvisionAttendanceSyncService } from './hikvision-attendance-sync.service';

@ApiTags('Hikvision Attendance')
@ApiBearerAuth('access-token')
@Controller('hikvision')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class HikvisionAttendanceController {
  constructor(private readonly attendanceSyncService: HikvisionAttendanceSyncService) {}

  @Get('devices/:deviceId/attendance/capabilities')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Get Attendance Capabilities', 'Get Hikvision AcsEvent attendance capabilities')
  getCapabilities(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.attendanceSyncService.getAcsEventCapabilities(req.user.companyId!, deviceId);
  }

  @Post('devices/:deviceId/attendance/sync')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Sync Attendance By Date', 'Sync attendance events for one date')
  syncByDate(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() dto: SyncAttendanceByDateDto,
  ) {
    return this.attendanceSyncService.syncAttendanceByDate(
      req.user.companyId!,
      deviceId,
      dto.date,
      dto.timezone,
      dto.maxResults ?? 100,
    );
  }

  @Post('devices/:deviceId/attendance/sync-range')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Sync Attendance By Range', 'Sync attendance events for a date-time range')
  syncByRange(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() dto: SyncAttendanceByRangeDto,
  ) {
    return this.attendanceSyncService.syncAttendanceByRange(
      req.user.companyId!,
      deviceId,
      dto.startTime,
      dto.endTime,
      dto.maxResults ?? 100,
    );
  }

  @Post('devices/:deviceId/attendance/sync-employee')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Sync Attendance By Employee', 'Sync attendance events for one employee')
  syncByEmployee(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() dto: SyncAttendanceByEmployeeDto,
  ) {
    return this.attendanceSyncService.syncAttendanceByEmployee(
      req.user.companyId!,
      deviceId,
      dto.employeeNo,
      dto.startTime,
      dto.endTime,
      dto.maxResults ?? 100,
    );
  }

  @Post('devices/:deviceId/attendance/pull-page')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Pull Attendance Page', 'Pull and persist one AcsEvent page')
  pullPage(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() dto: PullAttendancePageDto,
  ) {
    return this.attendanceSyncService.pullAttendancePage(
      req.user.companyId!,
      deviceId,
      dto.AcsEventCond,
    );
  }

  @Get('devices/:deviceId/attendance/logs')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiListOperation('Device Attendance Logs', 'List Hikvision attendance logs for one device')
  getDeviceLogs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Query() query: QueryHikvisionAttendanceLogsDto,
  ) {
    return this.attendanceSyncService.findLogs(req.user.companyId!, {
      ...query,
      device_id: deviceId,
    });
  }

  @Get('attendance/logs')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiListOperation('Attendance Logs', 'List Hikvision attendance logs')
  getLogs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryHikvisionAttendanceLogsDto,
  ) {
    return this.attendanceSyncService.findLogs(req.user.companyId!, query);
  }
}
