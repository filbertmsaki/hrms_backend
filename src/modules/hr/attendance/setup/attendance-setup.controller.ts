import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { AttendanceSetupCompletionService } from './attendance-setup-completion.service';
import { AttendanceSetupWizardService } from './attendance-setup-wizard.service';
import { CreateAttendanceSetupWizardDto } from './dtos/create-attendance-setup-wizard.dto';

@ApiTags('Attendance Setup')
@ApiBearerAuth('access-token')
@Controller('hr/attendance/setup')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceSetupController {
  constructor(
    private readonly setupCompletionService: AttendanceSetupCompletionService,
    private readonly setupWizardService: AttendanceSetupWizardService,
  ) {}

  @Get('status')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_policies:read')
  @ApiOkResponse({
    description: 'Returns attendance setup completion status.',
  })
  getStatus(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.setupCompletionService.getStatus(req.user.companyId!);
  }

  @Post('wizard')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_policies:create')
  @ApiOkResponse({
    description:
      'Creates attendance policy, geofence, WiFi, holiday group and checkpoints in one setup flow.',
  })
  createSetup(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateAttendanceSetupWizardDto,
  ) {
    return this.setupWizardService.createSetup(req.user.companyId!, dto);
  }
}
