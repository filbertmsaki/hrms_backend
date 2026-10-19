import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  ApiActionOperation,
  ApiGetOneOperation,
} from '../../../docs/swagger-decorators';
import { AttendanceSyncFailureAlertService } from './attendance-sync-failure-alert.service';

@Controller('attendance/device-sync-alerts')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceSyncAlertsController {
  constructor(
    private readonly alertService: AttendanceSyncFailureAlertService,
  ) {}

  @Get('readiness')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_device_sync_logs:read')
  @ApiGetOneOperation(
    'Attendance sync alert readiness',
    'Check whether this company has active operators eligible to receive sync alerts.',
  )
  readiness(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.alertService.getReadiness(req.user.companyId!);
  }

  @Post('test')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  @ApiActionOperation(
    'Send attendance sync alert test',
    'Send a deduplicated, in-app test notification to active company sync operators.',
  )
  sendTest(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.alertService.sendTestAlert(req.user.companyId!);
  }
}
