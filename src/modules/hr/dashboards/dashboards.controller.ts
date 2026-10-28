import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { ManagerDashboardQueryDto } from '../manager-self-service/dtos/manager-dashboard-query.dto';
import { PublishedScoreDrilldownQueryDto } from './dtos/published-score-drilldown-query.dto';
import { PublishedScoreDrilldownService } from './published-score-drilldown.service';
import { CreateEmployeeDocumentRequirementDto } from './dtos/employee-document-requirement.dto';
import { EmployeeDocumentComplianceDrilldownQueryDto } from './dtos/employee-document-compliance-drilldown-query.dto';

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
    private readonly publishedScoreDrilldownService: PublishedScoreDrilldownService,
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
    @Query() query: ManagerDashboardQueryDto,
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

  @Get('management/performance-details')
  @Permissions('dashboard:management')
  @ApiOperation({ summary: 'Get a scoped page of published management scores' })
  managementPerformanceDetails(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: PublishedScoreDrilldownQueryDto,
  ) {
    return this.publishedScoreDrilldownService.getPage(req.user, query);
  }

  @Get('hr/document-requirements')
  @Permissions('dashboard:hr')
  @ApiOperation({ summary: 'List company employee document requirements' })
  hrDocumentRequirements(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.hrDashboardService.listDocumentRequirements(req.user);
  }

  @Get('hr/document-requirements/:requirementId/details')
  @Permissions('dashboard:hr')
  @ApiOperation({ summary: 'Get a scoped page of employee compliance details' })
  hrDocumentRequirementDetails(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('requirementId', ParseIntPipe) requirementId: number,
    @Query() query: EmployeeDocumentComplianceDrilldownQueryDto,
  ) {
    return this.hrDashboardService.getDocumentComplianceDetails(
      req.user,
      requirementId,
      query,
    );
  }

  @Post('hr/document-requirements')
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Configure a required employee document type' })
  createHrDocumentRequirement(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateEmployeeDocumentRequirementDto,
  ) {
    return this.hrDashboardService.createDocumentRequirement(req.user, dto);
  }

  @Delete('hr/document-requirements/:id')
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Remove a required employee document type' })
  deleteHrDocumentRequirement(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hrDashboardService.deleteDocumentRequirement(req.user, id);
  }
}
