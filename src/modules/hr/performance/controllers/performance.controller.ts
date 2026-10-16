import { KpiCategoryService } from '../services/kpi-category.service';
import { CreateKpiCategoryDto } from '../dto/create-kpi-category.dto';
import { UseFilters } from '@nestjs/common';
import { WorkflowDatabaseExceptionFilter } from '../../../../common/filters/workflow-database-exception.filter';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import type { Response as ExpressResponse } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { CalculatePerformanceAggregatesDto } from '../dto/calculate-performance-aggregates.dto';
import { CreateKpiApplicabilityRuleDto } from '../dto/create-kpi-applicability-rule.dto';
import { ApprovePerformanceReviewDto } from '../dto/approve-performance-review.dto';
import { CreateCompetencyTemplateDto } from '../dto/create-competency-template.dto';
import { CreateKpiDefinitionDto } from '../dto/create-kpi-definition.dto';
import { CreatePerformanceFeedback360RequestDto } from '../dto/create-performance-feedback-360-request.dto';
import { CreatePerformanceFinancialYearDto } from '../dto/create-performance-financial-year.dto';
import { CreatePerformanceImprovementPlanDto } from '../dto/create-performance-improvement-plan.dto';
import {
  CarryForwardPerformanceDevelopmentGoalsDto,
  CreatePerformanceDevelopmentPlanDto,
  UpdatePerformanceDevelopmentGoalDto,
} from '../dto/performance-development-plan.dto';
import { CreatePerformancePlanDto } from '../dto/create-performance-plan.dto';
import { CreatePerformanceRatingScaleDto } from '../dto/create-performance-rating-scale.dto';
import { CreatePerformanceScorecardConfigDto } from '../dto/performance-scorecard-config.dto';
import {
  CreatePerformanceWorkflowConfigDto,
  PerformanceWorkflowActionDto,
} from '../dto/performance-workflow.dto';
import { CreateKpiTemplateDto } from '../dto/create-kpi-template.dto';
import { GeneratePerformancePlanFromRulesDto } from '../dto/generate-performance-plan-from-rules.dto';
import { ModeratePerformanceReviewDto } from '../dto/moderate-performance-review.dto';
import { ReopenPerformanceReviewDto } from '../dto/reopen-performance-review.dto';
import { ReopenKpiReviewDto } from '../dto/employee-kpi-cycle-review.dto';
import { ReviewPerformanceImprovementMilestoneDto } from '../dto/review-performance-improvement-milestone.dto';
import { SyncSystemKpisDto } from '../dto/sync-system-kpis.dto';
import { KpiApplicabilityService } from '../services/kpi-applicability.service';
import { KpiDefinitionService } from '../services/kpi-definition.service';
import { KpiDataSourceRegistryService } from '../services/kpi-data-source-registry.service';
import { PerformanceAggregationService } from '../services/performance-aggregation.service';
import { PerformanceCalibrationService } from '../services/performance-calibration.service';
import { PerformanceFeedback360Service } from '../services/performance-feedback-360.service';
import { PerformanceCompetencyService } from '../services/performance-competency.service';
import { PerformanceDevelopmentPlanService } from '../services/performance-development-plan.service';
import { PerformanceFinancialYearService } from '../services/performance-financial-year.service';
import { PerformanceImprovementPlanService } from '../services/performance-improvement-plan.service';
import { PerformanceInsightsService } from '../services/performance-insights.service';
import { PerformancePeriodService } from '../services/performance-period.service';
import { PerformancePlanService } from '../services/performance-plan.service';
import { PerformanceRatingScaleService } from '../services/performance-rating-scale.service';
import { PerformanceReportService } from '../services/performance-report.service';
import type { PerformanceReportFormat } from '../services/performance-report.service';
import { PerformanceReviewService } from '../services/performance-review.service';
import { PerformanceScorecardService } from '../services/performance-scorecard.service';
import { PerformanceWorkflowService } from '../services/performance-workflow.service';
import { EmployeeKpiCycleReviewService } from '../services/employee-kpi-cycle-review.service';
import { EmployeeKpiTemplateAssignmentService } from '../services/employee-kpi-template-assignment.service';
import { ApplyKpiTemplateDto } from '../dto/apply-kpi-template.dto';
import {
  CreatePerformancePeriodDto,
  PerformancePeriodQueryDto,
  ReopenPerformancePeriodDto,
  UpdatePerformancePeriodDto,
} from '../dto/performance-period.dto';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Performance Management')
@ApiBearerAuth('access-token')
@UseFilters(WorkflowDatabaseExceptionFilter)
@Controller('performance')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class PerformanceController {
  constructor(
    private readonly financialYearService: PerformanceFinancialYearService,
    private readonly periodService: PerformancePeriodService,
    private readonly ratingScaleService: PerformanceRatingScaleService,
    private readonly scorecardService: PerformanceScorecardService,
    private readonly workflowService: PerformanceWorkflowService,
    private readonly competencyService: PerformanceCompetencyService,
    private readonly kpiDefinitionService: KpiDefinitionService,
    private readonly kpiCategoryService: KpiCategoryService,
    private readonly applicabilityService: KpiApplicabilityService,
    private readonly planService: PerformancePlanService,
    private readonly dataSourceRegistryService: KpiDataSourceRegistryService,
    private readonly reviewService: PerformanceReviewService,
    private readonly improvementPlanService: PerformanceImprovementPlanService,
    private readonly developmentPlanService: PerformanceDevelopmentPlanService,
    private readonly reportService: PerformanceReportService,
    private readonly aggregationService: PerformanceAggregationService,
    private readonly calibrationService: PerformanceCalibrationService,
    private readonly insightsService: PerformanceInsightsService,
    private readonly feedback360Service: PerformanceFeedback360Service,
    private readonly cycleReviewService: EmployeeKpiCycleReviewService,
    private readonly templateAssignmentService: EmployeeKpiTemplateAssignmentService,
  ) {}

  @Post('periods/:id/apply-kpi-template')
  @UseGuards(PermissionsGuard)
  @Permissions('kpi_templates:create')
  applyKpiTemplate(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplyKpiTemplateDto,
  ) {
    return this.templateAssignmentService.apply(req.user, id, dto);
  }

  @Post('employee-kpis/:id/reopen')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_periods:reopen')
  reopenEmployeeKpi(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReopenKpiReviewDto,
  ) {
    return this.cycleReviewService.reopenAssignment(req.user, id, dto);
  }

  @Post('financial-years')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_financial_years:create')
  createFinancialYear(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePerformanceFinancialYearDto,
  ) {
    return this.financialYearService.create(req.user, dto);
  }

  @Get('financial-years')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_financial_years:read')
  listFinancialYears(@Req() req: AuthedRequest) {
    return this.financialYearService.list(req.user);
  }

  @Get('periods')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_periods:read')
  listPeriods(
    @Req() req: AuthedRequest,
    @Query() query: PerformancePeriodQueryDto,
  ) {
    return this.periodService.list(req.user, query);
  }

  @Get('periods/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_periods:read')
  getPeriod(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.periodService.get(req.user, id);
  }

  @Post('periods')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_periods:create')
  createPeriod(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePerformancePeriodDto,
  ) {
    return this.periodService.create(req.user, dto);
  }

  @Patch('periods/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_periods:update')
  updatePeriod(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePerformancePeriodDto,
  ) {
    return this.periodService.update(req.user, id, dto);
  }

  @Post('periods/:id/activate')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_periods:activate')
  activatePeriod(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.periodService.activate(req.user, id);
  }

  @Post('periods/:id/close')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_periods:close')
  closePeriod(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.periodService.close(req.user, id);
  }

  @Post('periods/:id/reopen')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_periods:reopen')
  reopenPeriod(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReopenPerformancePeriodDto,
  ) {
    return this.periodService.reopen(req.user, id, dto);
  }

  @Post('financial-years/:id/generate-periods')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_periods:create')
  generatePeriods(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.periodService.generatePeriods(id, req.user);
  }

  @Post('rating-scales')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_rating_scales:create')
  createRatingScale(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePerformanceRatingScaleDto,
  ) {
    return this.ratingScaleService.create(req.user, dto);
  }

  @Get('rating-scales')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_rating_scales:read')
  listRatingScales(@Req() req: AuthedRequest) {
    return this.ratingScaleService.list(req.user);
  }

  @Post('scorecards')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_scorecards:create')
  createScorecard(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePerformanceScorecardConfigDto,
  ) {
    return this.scorecardService.create(req.user, dto);
  }

  @Get('scorecards')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_scorecards:read')
  listScorecards(@Req() req: AuthedRequest) {
    return this.scorecardService.list(req.user);
  }

  @Post('workflows')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_workflows:create')
  createWorkflow(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePerformanceWorkflowConfigDto,
  ) {
    return this.workflowService.create(req.user, dto);
  }

  @Get('workflows')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_workflows:read')
  listWorkflows(@Req() req: AuthedRequest) {
    return this.workflowService.list(req.user);
  }

  @Post('competency-templates')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_competencies:create')
  createCompetencyTemplate(
    @Req() req: AuthedRequest,
    @Body() dto: CreateCompetencyTemplateDto,
  ) {
    return this.competencyService.createTemplate(req.user, dto);
  }

  @Get('competency-templates')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_competencies:read')
  listCompetencyTemplates(@Req() req: AuthedRequest) {
    return this.competencyService.listTemplates(req.user);
  }

  @Get('kpi-categories')
  @UseGuards(PermissionsGuard)
  @Permissions('kpi_definitions:read')
  listKpiCategories(@Req() req: AuthedRequest) {
    return this.kpiCategoryService.list(req.user);
  }

  @Post('kpi-categories')
  @UseGuards(PermissionsGuard)
  @Permissions('kpi_definitions:create')
  createKpiCategory(
    @Req() req: AuthedRequest,
    @Body() dto: CreateKpiCategoryDto,
  ) {
    return this.kpiCategoryService.create(req.user, dto);
  }

  @Patch('kpi-categories/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('kpi_definitions:update')
  updateKpiCategory(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateKpiCategoryDto,
  ) {
    return this.kpiCategoryService.update(req.user, id, dto);
  }

  @Delete('kpi-categories/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('kpi_definitions:update')
  deleteKpiCategory(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.kpiCategoryService.remove(req.user, id);
  }

  @Post('kpis')
  @UseGuards(PermissionsGuard)
  @Permissions('kpi_definitions:create')
  createKpi(@Req() req: AuthedRequest, @Body() dto: CreateKpiDefinitionDto) {
    return this.kpiDefinitionService.create(req.user, dto);
  }

  @Post('kpis/:id/versions')
  @UseGuards(PermissionsGuard)
  @Permissions('kpi_definitions:update')
  createKpiVersion(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateKpiDefinitionDto,
  ) {
    return this.kpiDefinitionService.createVersion(req.user, id, dto);
  }

  @Patch('kpis/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('kpi_definitions:update')
  updateKpi(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateKpiDefinitionDto,
  ) {
    // KPI definitions are versioned: an edit creates the next definition
    // version while keeping historical plan/template references immutable.
    return this.kpiDefinitionService.createVersion(req.user, id, dto);
  }

  @Delete('kpis/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('kpi_definitions:update')
  archiveKpi(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.kpiDefinitionService.archive(req.user, id);
  }

  @Get('kpis')
  @UseGuards(PermissionsGuard)
  @Permissions('kpi_definitions:read')
  listKpis(@Req() req: AuthedRequest) {
    return this.kpiDefinitionService.list(req.user);
  }

  @Post('kpi-rules')
  @UseGuards(PermissionsGuard)
  @Permissions('kpi_applicability_rules:create')
  createApplicabilityRule(
    @Req() req: AuthedRequest,
    @Body() dto: CreateKpiApplicabilityRuleDto,
  ) {
    return this.applicabilityService.createRule(req.user, dto);
  }

  @Get('kpi-rules')
  @UseGuards(PermissionsGuard)
  @Permissions('kpi_applicability_rules:read')
  listApplicabilityRules(@Req() req: AuthedRequest) {
    return this.applicabilityService.listRules(req.user);
  }

  @Post('kpi-templates')
  @UseGuards(PermissionsGuard)
  @Permissions('kpi_templates:create')
  createTemplate(@Req() req: AuthedRequest, @Body() dto: CreateKpiTemplateDto) {
    return this.applicabilityService.createTemplate(req.user, dto);
  }

  @Get('kpi-templates')
  @UseGuards(PermissionsGuard)
  @Permissions('kpi_templates:read')
  listTemplates(@Req() req: AuthedRequest) {
    return this.applicabilityService.listTemplates(req.user);
  }

  @Post('plans')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_plans:create')
  createPlan(@Req() req: AuthedRequest, @Body() dto: CreatePerformancePlanDto) {
    return this.planService.create(req.user, dto);
  }

  @Post('plans/generate-from-rules')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_plans:create')
  generatePlanFromRules(
    @Req() req: AuthedRequest,
    @Body() dto: GeneratePerformancePlanFromRulesDto,
  ) {
    return this.applicabilityService.generatePlanFromRules(req.user, dto);
  }

  @Get('plans')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_plans:read')
  listPlans(@Req() req: AuthedRequest) {
    return this.planService.list(req.user);
  }

  @Post('periods/:id/assignments')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_assignments:create')
  createAssignmentsForPeriod(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.planService.createAssignmentsForPeriod(req.user, id);
  }

  @Post('periods/:id/sync-system-kpis')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:sync')
  syncSystemKpis(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SyncSystemKpisDto,
  ) {
    return this.dataSourceRegistryService.syncPeriod(
      req.user,
      id,
      dto.provider_key,
    );
  }

  @Post('reviews/:periodAssignmentId/approve')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_reviews:approve')
  approveReview(
    @Req() req: AuthedRequest,
    @Param('periodAssignmentId', ParseIntPipe) periodAssignmentId: number,
    @Body() dto: ApprovePerformanceReviewDto,
  ) {
    return this.reviewService.approve(req.user, periodAssignmentId, dto);
  }

  @Get('reviews/:id/workflow')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_reviews:workflow-read')
  getReviewWorkflow(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.workflowService.getReviewWorkflow(req.user, id);
  }

  @Post('reviews/:id/workflow/action')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_reviews:workflow-action')
  async actionReviewWorkflow(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PerformanceWorkflowActionDto,
  ) {
    const result = await this.workflowService.actOnCurrentStep(
      req.user,
      id,
      dto,
    );
    if (!result.completed) {
      return result;
    }
    return this.reviewService.approve(req.user, result.periodAssignmentId, dto);
  }

  @Post('reviews/:id/moderate')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_reviews:moderate')
  moderateReview(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModeratePerformanceReviewDto,
  ) {
    return this.reviewService.moderate(req.user, id, dto);
  }

  @Post('reviews/:id/reopen')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_reviews:reopen')
  reopenReview(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReopenPerformanceReviewDto,
  ) {
    return this.reviewService.reopen(req.user, id, dto);
  }

  @Get('appeals')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_reviews:appeal-review')
  listAppeals(@Req() req: AuthedRequest) {
    return this.reviewService.listAppeals(req.user);
  }

  @Post('reviews/:id/improvement-plan')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_pip:create')
  createImprovementPlan(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePerformanceImprovementPlanDto,
  ) {
    return this.improvementPlanService.create(req.user, id, dto);
  }

  @Get('improvement-plans')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_pip:read')
  listImprovementPlans(@Req() req: AuthedRequest) {
    return this.improvementPlanService.list(req.user);
  }

  @Post('development-plans')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_development_plans:create')
  createDevelopmentPlan(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePerformanceDevelopmentPlanDto,
  ) {
    return this.developmentPlanService.create(req.user, dto);
  }

  @Get('development-plans')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_development_plans:read')
  listDevelopmentPlans(@Req() req: AuthedRequest) {
    return this.developmentPlanService.list(req.user);
  }

  @Get('reports/catalog')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_reports:read')
  listReportCatalog() {
    return this.reportService.catalog();
  }

  @Get('reports/:code/rows')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_reports:read')
  reportRows(@Req() req: AuthedRequest, @Param('code') code: string) {
    return this.reportService.rows(req.user, code);
  }

  @Get('reports/:code/export')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_reports:export')
  async exportReport(
    @Req() req: AuthedRequest,
    @Param('code') code: string,
    @Query('format') format = 'csv',
    @Res() res: ExpressResponse,
  ) {
    const normalizedFormat = format.toLowerCase() as PerformanceReportFormat;
    const buffer = await this.reportService.export(
      req.user,
      code,
      normalizedFormat,
    );
    const contentTypes: Record<PerformanceReportFormat, string> = {
      json: 'application/json',
      csv: 'text/csv',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
    };
    res.setHeader('Content-Type', contentTypes[normalizedFormat]);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${code.toLowerCase()}.${normalizedFormat}"`,
    );
    return res.send(buffer);
  }

  @Patch('development-goals/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_development_plans:update')
  updateDevelopmentGoal(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePerformanceDevelopmentGoalDto,
  ) {
    return this.developmentPlanService.updateGoal(req.user, id, dto);
  }

  @Post('development-plans/carry-forward')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_development_plans:create')
  carryForwardDevelopmentGoals(
    @Req() req: AuthedRequest,
    @Body() dto: CarryForwardPerformanceDevelopmentGoalsDto,
  ) {
    return this.developmentPlanService.carryForward(req.user, dto);
  }

  @Post('improvement-milestones/:id/review')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_pip:review')
  reviewImprovementMilestone(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewPerformanceImprovementMilestoneDto,
  ) {
    return this.improvementPlanService.reviewMilestone(req.user, id, dto);
  }

  @Post('improvement-plans/:id/close')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_pip:close')
  closeImprovementPlan(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.improvementPlanService.close(req.user, id);
  }

  @Post('reviews/:id/feedback-360/invitations')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_feedback_360:invite')
  inviteFeedback360(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePerformanceFeedback360RequestDto,
  ) {
    return this.feedback360Service.invite(req.user, id, dto);
  }

  @Get('reviews/:id/feedback-360')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_feedback_360:read')
  listFeedback360(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.feedback360Service.listForReview(req.user, id);
  }

  @Get('reviews/:id/feedback-360/summary')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_feedback_360:read')
  getFeedback360Summary(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.feedback360Service.getSummaryForReview(req.user, id);
  }

  @Get('calibration/departments')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_calibration:read')
  getCalibrationDepartmentSummary(@Req() req: AuthedRequest) {
    return this.calibrationService.departmentSummary(req.user);
  }

  @Get('calibration/comparison')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_calibration:read')
  getCalibrationComparison(@Req() req: AuthedRequest) {
    return this.calibrationService.comparison(req.user);
  }

  @Get('dashboard/summary')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_dashboards:read')
  getDashboardSummary(@Req() req: AuthedRequest) {
    return this.insightsService.getCompanySummary(req.user);
  }

  @Post('financial-years/:id/aggregates')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_aggregates:calculate')
  calculateAggregates(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CalculatePerformanceAggregatesDto,
  ) {
    return this.aggregationService.calculate(req.user, id, dto.period_type);
  }
}
