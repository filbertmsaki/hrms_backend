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
import {
  ApiCreateOperation,
  ApiGetOneOperation,
  ApiListOperation,
} from '../../../../docs/swagger-decorators';
import { AttendanceDeviceSyncLogsService } from './attendance-device-sync-logs.service';
import { AttendanceDeviceSyncLogQueryDto } from './dtos/attendance-device-sync-log-query.dto';
import { CreateAttendanceDeviceSyncLogDto } from './dtos/create-attendance-device-sync-log.dto';

@ApiTags('Attendance Device Sync Logs')
@ApiBearerAuth('access-token')
@Controller('attendance/device-sync-logs')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceDeviceSyncLogsController {
  constructor(
    private readonly syncLogsService: AttendanceDeviceSyncLogsService,
  ) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_device_sync_logs:create')
  @ApiCreateOperation(
    'Attendance Device Sync Log',
    'Create attendance device sync log',
  )
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateAttendanceDeviceSyncLogDto,
  ) {
    return this.syncLogsService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_device_sync_logs:read')
  @ApiListOperation(
    'Attendance Device Sync Log',
    'List attendance device sync logs',
  )
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: AttendanceDeviceSyncLogQueryDto,
  ) {
    return this.syncLogsService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_device_sync_logs:read')
  @ApiGetOneOperation(
    'Attendance Device Sync Log',
    'Get attendance device sync log by ID',
  )
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.syncLogsService.findOne(req.user.companyId!, id);
  }
}
