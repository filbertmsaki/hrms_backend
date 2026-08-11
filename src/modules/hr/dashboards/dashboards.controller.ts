import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { EmployeeDashboardService } from './employee-dashboard.service';
import { ManagerDashboardService } from './manager-dashboard.service';
import { HrDashboardService } from './hr-dashboard.service';
import { ManagementDashboardService } from './management-dashboard.service';
import { DashboardQueryDto } from './dtos/dashboard-query.dto';

@ApiTags('HR Dashboards')
@ApiBearerAuth('access-token')
@Controller('dashboards')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class DashboardsController {
  constructor(
    private readonly employeeDashboardService: EmployeeDashboardService,
    private readonly managerDashboardService: ManagerDashboardService,
    private readonly hrDashboardService: HrDashboardService,
    private readonly managementDashboardService: ManagementDashboardService,
  ) {}

  @Get('employee')
  @Permissions('dashboard:employee')
  @ApiOperation({ summary: 'Get my employee dashboard' })
  employee(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.employeeDashboardService.getDashboard(req.user);
  }

  @Get('manager')
  @Permissions('dashboard:manager')
  @ApiOperation({ summary: 'Get the manager dashboard' })
  manager(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: DashboardQueryDto,
  ) {
    return this.managerDashboardService.getDashboard(req.user, query);
  }

  @Get('hr')
  @Permissions('dashboard:hr')
  @ApiOperation({ summary: 'Get the HR dashboard' })
  hr(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: DashboardQueryDto,
  ) {
    return this.hrDashboardService.getDashboard(req.user, query);
  }

  @Get('management')
  @Permissions('dashboard:management')
  @ApiOperation({ summary: 'Get the management dashboard' })
  management(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: DashboardQueryDto,
  ) {
    return this.managementDashboardService.getDashboard(req.user, query);
  }
}
