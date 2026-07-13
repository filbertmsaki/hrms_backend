import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { AttendanceSchedulePreviewService } from './attendance-schedule-preview.service';
import { AttendanceSchedulePreviewQueryDto } from './dtos/attendance-schedule-preview-query.dto';

@ApiTags('Attendance Schedule Preview')
@ApiBearerAuth('access-token')
@Controller('hr/attendance/schedules')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceSchedulePreviewController {
  constructor(
    private readonly schedulePreviewService: AttendanceSchedulePreviewService,
  ) {}

  @Get('preview')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_processing:read')
  preview(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: AttendanceSchedulePreviewQueryDto,
  ) {
    return this.schedulePreviewService.preview(req.user.companyId!, query);
  }
}
