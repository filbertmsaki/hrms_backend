import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest, Response } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  AnalyticsCustomReportDto,
  AnalyticsExportDto,
  AnalyticsOperationalReportQueryDto,
  AnalyticsQueryDto,
  AnalyticsSalesFieldDetailQueryDto,
  AnalyticsRefreshDto,
  QuerySavedAnalyticsReportsDto,
  SaveAnalyticsReportDto,
  StatutoryReportRunDto,
  UpdateSavedAnalyticsReportDto,
} from '../dto/analytics.dto';
import {
  AnalyticsDatasetService,
  AnalyticsDashboardService,
  AnalyticsExportService,
  AnalyticsFreshnessService,
  AnalyticsMetricService,
  AnalyticsOperationalReportService,
  AnalyticsReconciliationService,
  AnalyticsReportService,
  AnalyticsSavedReportService,
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
    private readonly savedReportService: AnalyticsSavedReportService,
    private readonly operationalReportService: AnalyticsOperationalReportService,
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
  freshness(
    @Req() req: AuthedRequest,
    @Query('dataset_code') datasetCode?: string,
  ) {
    return this.freshnessService.freshness(req.user.companyId!, datasetCode);
  }

  @Get('dashboards/hr')
  @Permissions('analytics:dashboards:hr')
  hrDashboard(@Req() req: AuthedRequest, @Query() query: AnalyticsQueryDto) {
    return this.dashboardService.hrDashboard(req.user, query);
  }

  @Get('dashboards/management')
  @Permissions('analytics:dashboards:management')
  managementDashboard(
    @Req() req: AuthedRequest,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.dashboardService.managementDashboard(req.user, query);
  }

  @Get('dashboards/manager')
  @Permissions('analytics:dashboards:manager')
  managerDashboard(
    @Req() req: AuthedRequest,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.dashboardService.managerDashboard(req.user, query);
  }

  @Get('dashboards/sales-field')
  @Permissions('analytics:dashboards:sales-field')
  salesFieldDashboard(
    @Req() req: AuthedRequest,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.dashboardService.salesFieldDashboard(req.user, query);
  }

  @Get('dashboards/sales-field/details')
  @Permissions('analytics:dashboards:sales-field')
  salesFieldDetails(
    @Req() req: AuthedRequest,
    @Query() query: AnalyticsSalesFieldDetailQueryDto,
  ) {
    return this.dashboardService.salesFieldDetails(req.user, query);
  }

  @Post('reports/custom')
  @Permissions('analytics:reports')
  customReport(
    @Req() req: AuthedRequest,
    @Body() dto: AnalyticsCustomReportDto,
  ) {
    return this.reportService.runCustomReport(req.user, dto);
  }

  @Get('reports/catalog')
  @Permissions('analytics:reports')
  reportCatalog() {
    return this.reportService.reportCatalog();
  }

  @Get('reports/operational')
  @Permissions('analytics:reports')
  operationalReports() {
    return this.operationalReportService.listDefinitions();
  }

  @Get('reports/operational/:code')
  @Permissions('analytics:reports')
  runOperationalReport(
    @Req() req: AuthedRequest,
    @Param('code') code: string,
    @Query() query: AnalyticsOperationalReportQueryDto,
  ) {
    return this.operationalReportService.run(req.user, code, query);
  }

  @Get('reports/operational/:code/export')
  @Permissions('analytics:reports')
  async exportOperationalReport(
    @Req() req: AuthedRequest,
    @Param('code') code: string,
    @Query() query: AnalyticsOperationalReportQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.operationalReportService.export(
      req.user,
      code,
      query,
    );
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename.replace(/"/g, '')}"`,
    );
    res.send(file.buffer);
  }

  @Get('reports/saved')
  @Permissions('analytics:reports')
  savedReports(
    @Req() req: AuthedRequest,
    @Query() query: QuerySavedAnalyticsReportsDto,
  ) {
    return this.savedReportService.list(req.user, query);
  }

  @Post('reports/saved')
  @Permissions('analytics:reports')
  saveReport(@Req() req: AuthedRequest, @Body() dto: SaveAnalyticsReportDto) {
    return this.savedReportService.create(req.user, dto);
  }

  @Put('reports/saved/:id')
  @Permissions('analytics:reports')
  updateSavedReport(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateSavedAnalyticsReportDto,
  ) {
    return this.savedReportService.update(req.user, id, dto);
  }

  @Delete('reports/saved/:id')
  @Permissions('analytics:reports')
  deleteSavedReport(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.savedReportService.remove(req.user, id);
  }

  @Post('reports/saved/:id/run')
  @Permissions('analytics:reports')
  runSavedReport(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() query: AnalyticsQueryDto,
  ) {
    return this.savedReportService.run(req.user, id, query);
  }

  @Post('exports')
  @Permissions('analytics:exports')
  exportReport(@Req() req: AuthedRequest, @Body() dto: AnalyticsExportDto) {
    return this.exportService.create(req.user, dto);
  }

  @Get('exports/:id/download')
  @Permissions('analytics:exports')
  async downloadExport(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const file = await this.exportService.download(req.user, id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename.replace(/"/g, '')}"`,
    );
    res.send(file.buffer);
  }

  @Post('statutory-reports/run')
  @Permissions('analytics:statutory-reports')
  statutoryReport(
    @Req() req: AuthedRequest,
    @Body() dto: StatutoryReportRunDto,
  ) {
    return this.statutoryReportService.run(req.user, dto);
  }

  @Post('reconciliation/run')
  @Permissions('analytics:reconciliation')
  reconciliation(@Req() req: AuthedRequest) {
    return this.reconciliationService.reconcile(req.user);
  }
}
