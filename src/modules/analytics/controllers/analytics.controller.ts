import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  AnalyticsCustomReportDto,
  AnalyticsExportDto,
  AnalyticsQueryDto,
  AnalyticsRefreshDto,
  StatutoryReportRunDto,
} from '../dto/analytics.dto';
import {
  AnalyticsDatasetService,
  AnalyticsDashboardService,
  AnalyticsExportService,
  AnalyticsFreshnessService,
  AnalyticsMetricService,
  AnalyticsReconciliationService,
  AnalyticsReportService,
  AnalyticsSnapshotService,
  AnalyticsSourceRegistryService,
  AnalyticsStatutoryReportService,
} from '../services/analytics-core.services';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Advanced Analytics')
@ApiBearerAuth('access-token')
@Controller('analytics')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(
    private readonly sourceRegistry: AnalyticsSourceRegistryService,
    private readonly datasetService: AnalyticsDatasetService,
    private readonly metricService: AnalyticsMetricService,
    private readonly snapshotService: AnalyticsSnapshotService,
    private readonly freshnessService: AnalyticsFreshnessService,
    private readonly dashboardService: AnalyticsDashboardService,
    private readonly reportService: AnalyticsReportService,
    private readonly exportService: AnalyticsExportService,
    private readonly reconciliationService: AnalyticsReconciliationService,
    private readonly statutoryReportService: AnalyticsStatutoryReportService,
  ) {}

  @Get('sources')
  @Permissions('analytics:sources:read')
  sources() {
    return this.sourceRegistry.list();
  }

  @Get('datasets')
  @Permissions('analytics:datasets:read')
  datasets() {
    return this.datasetService.list();
  }

  @Get('metrics')
  @Permissions('analytics:metrics:read')
  metrics() {
    return this.metricService.list();
  }

  @Post('refresh')
  @Permissions('analytics:refresh')
  refresh(@Req() req: AuthedRequest, @Body() dto: AnalyticsRefreshDto) {
    return this.snapshotService.refresh(req.user, dto);
  }

  @Get('freshness')
  @Permissions('analytics:datasets:read')
  freshness(@Req() req: AuthedRequest, @Query('dataset_code') datasetCode?: string) {
    return this.freshnessService.freshness(req.user.companyId!, datasetCode);
  }

  @Get('dashboards/hr')
  @Permissions('analytics:dashboards:hr')
  hrDashboard(@Req() req: AuthedRequest, @Query() query: AnalyticsQueryDto) {
    return this.dashboardService.hrDashboard(req.user, query);
  }

  @Get('dashboards/management')
  @Permissions('analytics:dashboards:management')
  managementDashboard(@Req() req: AuthedRequest, @Query() query: AnalyticsQueryDto) {
    return this.dashboardService.managementDashboard(req.user, query);
  }

  @Get('dashboards/manager')
  @Permissions('analytics:dashboards:manager')
  managerDashboard(@Req() req: AuthedRequest, @Query() query: AnalyticsQueryDto) {
    return this.dashboardService.managerDashboard(req.user, query);
  }

  @Get('dashboards/sales-field')
  @Permissions('analytics:dashboards:sales-field')
  salesFieldDashboard(@Req() req: AuthedRequest, @Query() query: AnalyticsQueryDto) {
    return this.dashboardService.salesFieldDashboard(req.user, query);
  }

  @Post('reports/custom')
  @Permissions('analytics:reports')
  customReport(@Req() req: AuthedRequest, @Body() dto: AnalyticsCustomReportDto) {
    return this.reportService.runCustomReport(req.user, dto);
  }

  @Post('exports')
  @Permissions('analytics:exports')
  exportReport(@Req() req: AuthedRequest, @Body() dto: AnalyticsExportDto) {
    return this.exportService.create(req.user, dto);
  }

  @Post('statutory-reports/run')
  @Permissions('analytics:statutory-reports')
  statutoryReport(@Req() req: AuthedRequest, @Body() dto: StatutoryReportRunDto) {
    return this.statutoryReportService.run(req.user, dto);
  }

  @Post('reconciliation/run')
  @Permissions('analytics:reconciliation')
  reconciliation(@Req() req: AuthedRequest) {
    return this.reconciliationService.reconcile(req.user);
  }
}
