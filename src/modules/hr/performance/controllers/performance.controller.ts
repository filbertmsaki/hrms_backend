import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { CalculatePerformanceAggregatesDto } from '../dto/calculate-performance-aggregates.dto';
import { CreateKpiApplicabilityRuleDto } from '../dto/create-kpi-applicability-rule.dto';
import { ApprovePerformanceReviewDto } from '../dto/approve-performance-review.dto';
import { CreateCompetencyTemplateDto } from '../dto/create-competency-template.dto';
import { CreateKpiDefinitionDto } from '../dto/create-kpi-definition.dto';
import { CreatePerformanceFinancialYearDto } from '../dto/create-performance-financial-year.dto';
import { CreatePerformanceImprovementPlanDto } from '../dto/create-performance-improvement-plan.dto';
import { CreatePerformancePlanDto } from '../dto/create-performance-plan.dto';
import { CreatePerformanceRatingScaleDto } from '../dto/create-performance-rating-scale.dto';
import { CreateKpiTemplateDto } from '../dto/create-kpi-template.dto';
import { GeneratePerformancePlanFromRulesDto } from '../dto/generate-performance-plan-from-rules.dto';
import { ModeratePerformanceReviewDto } from '../dto/moderate-performance-review.dto';
import { ReopenPerformanceReviewDto } from '../dto/reopen-performance-review.dto';
import { ReviewPerformanceImprovementMilestoneDto } from '../dto/review-performance-improvement-milestone.dto';
import { SyncSystemKpisDto } from '../dto/sync-system-kpis.dto';
import { KpiApplicabilityService } from '../services/kpi-applicability.service';
import { KpiDefinitionService } from '../services/kpi-definition.service';
import { KpiDataSourceRegistryService } from '../services/kpi-data-source-registry.service';
import { PerformanceAggregationService } from '../services/performance-aggregation.service';
import { PerformanceCompetencyService } from '../services/performance-competency.service';
import { PerformanceFinancialYearService } from '../services/performance-financial-year.service';
import { PerformanceImprovementPlanService } from '../services/performance-improvement-plan.service';
import { PerformanceInsightsService } from '../services/performance-insights.service';
import { PerformancePeriodService } from '../services/performance-period.service';
import { PerformancePlanService } from '../services/performance-plan.service';
import { PerformanceRatingScaleService } from '../services/performance-rating-scale.service';
import { PerformanceReviewService } from '../services/performance-review.service';
import {
  CreatePerformancePeriodDto,
  PerformancePeriodQueryDto,
  UpdatePerformancePeriodDto,
} from '../dto/performance-period.dto';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Performance Management')
@ApiBearerAuth('access-token')
@Controller('performance')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class PerformanceController {
  constructor(
    private readonly financialYearService: PerformanceFinancialYearService,
    private readonly periodService: PerformancePeriodService,
    private readonly ratingScaleService: PerformanceRatingScaleService,
    private readonly competencyService: PerformanceCompetencyService,
    private readonly kpiDefinitionService: KpiDefinitionService,
    private readonly applicabilityService: KpiApplicabilityService,
    private readonly planService: PerformancePlanService,
    private readonly dataSourceRegistryService: KpiDataSourceRegistryService,
    private readonly reviewService: PerformanceReviewService,
    private readonly improvementPlanService: PerformanceImprovementPlanService,
    private readonly aggregationService: PerformanceAggregationService,
    private readonly insightsService: PerformanceInsightsService,
  ) {}

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
